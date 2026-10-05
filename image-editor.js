(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  class ImageEditor {
    constructor() {
      this.canvas = $("editor-canvas");
      this.ctx = this.canvas.getContext("2d");

      this.preview = $("preview-canvas");
      this.previewCtx = this.preview.getContext("2d");

      this.source = null;
      this.mask = null;
      this.maskCtx = null;
      this.composite = null;
      this.compositeCtx = null;
      this.overlay = null;
      this.overlayCtx = null;

      this.mode = "original";
      this.tool = "brush";
      this.hasTransparency = false;
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;

      this.pointer = null;
      this.lastPoint = null;
      this.history = [];
      this.loadVersion = 0;
      this.ready = false;

      this.dirty = true;
      this.renderRequest = null;
      this.forcePreview = false;
      this.lastPreviewTime = 0;

      // チェック柄を毎回描き直さず、パターンとして再利用。
      const tile = makeCanvas(40, 40);
      const tileCtx = tile.getContext("2d");
      tileCtx.fillStyle = "#ffffff";
      tileCtx.fillRect(0, 0, 40, 40);
      tileCtx.fillStyle = "#e8e3eb";
      tileCtx.fillRect(0, 0, 20, 20);
      tileCtx.fillRect(20, 20, 20, 20);
      this.checker = this.ctx.createPattern(tile, "repeat");

      this.bindEvents();
      this.updateControls();
    }

    bindEvents() {
      $("use-original-button").addEventListener("click", () => {
        this.setMode("original");
      });

      $("select-region-button").addEventListener("click", () => {
        this.setMode("selection");
      });

      for (const [id, tool] of [
        ["brush-button", "brush"],
        ["eraser-button", "eraser"],
        ["pan-button", "pan"]
      ]) {
        $(id).addEventListener("click", () => {
          if (this.pointer) return;
          this.tool = tool;
          this.updateControls();
        });
      }

      $("undo-button").addEventListener("click", () => this.undo());

      $("editor-zoom").addEventListener("input", (event) => {
        this.zoom = Number(event.target.value);
        this.queueRender(true);
      });

      $("reset-view-button").addEventListener("click", () => {
        this.resetView();
      });

      this.canvas.addEventListener("pointerdown", (event) => {
        this.onPointerDown(event);
      });

      this.canvas.addEventListener("pointermove", (event) => {
        this.onPointerMove(event);
      });

      for (const name of [
        "pointerup", "pointercancel", "lostpointercapture"
      ]) {
        this.canvas.addEventListener(name, (event) => {
          this.finishPointer(event);
        });
      }

      window.addEventListener("blur", () => this.finishPointer());

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.finishPointer();
      });
    }

    async loadFile(file) {
      const version = ++this.loadVersion;
      if (!file) return false;

      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        throw new Error("PNG, JPG 또는 WebP 사진을 선택해줘.");
      }

      const url = URL.createObjectURL(file);

      try {
        const image = new Image();

        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(
            new Error("사진을 읽지 못했어. 다른 사진을 선택해줘.")
          );
          image.src = url;
        });

        if (version !== this.loadVersion) return false;

        /*
         * 편집용 사진은 긴 변 800픽셀 이하로 줄입니다.
         * 원본 파일은 변경하지 않습니다.
         */
        const ratio = Math.min(
          1,
          800 / Math.max(image.naturalWidth, image.naturalHeight)
        );

        const width = Math.max(
          1, Math.round(image.naturalWidth * ratio)
        );

        const height = Math.max(
          1, Math.round(image.naturalHeight * ratio)
        );

        this.finishPointer();
        this.history = [];

        this.source = makeCanvas(width, height);
        const sourceCtx = this.source.getContext("2d", {
          willReadFrequently: true
        });
        sourceCtx.drawImage(image, 0, 0, width, height);

        const pixels = sourceCtx.getImageData(
          0, 0, width, height
        ).data;

        this.hasTransparency = false;

        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] < 250) {
            this.hasTransparency = true;
            break;
          }
        }

        this.mask = makeCanvas(width, height);
        this.maskCtx = this.mask.getContext("2d", {
          willReadFrequently: true
        });

        this.composite = makeCanvas(width, height);
        this.compositeCtx = this.composite.getContext("2d");

        this.overlay = makeCanvas(width, height);
        this.overlayCtx = this.overlay.getContext("2d");

        this.mode = "original";
        this.tool = "brush";
        this.ready = true;
        this.dirty = true;

        this.resetView();
        this.updateControls();

        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    setMode(mode) {
      if (!this.ready || this.pointer || mode === this.mode) return;

      this.mode = mode;
      this.tool = "brush";
      this.dirty = true;

      this.resetView();
      this.updateControls();
    }

    resetView() {
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      $("editor-zoom").value = "1";
      this.queueRender(true);
    }

    updateControls() {
      $("editor-tools").hidden = this.mode !== "selection";

      $("use-original-button").setAttribute(
        "aria-pressed", String(this.mode === "original")
      );

      $("select-region-button").setAttribute(
        "aria-pressed", String(this.mode === "selection")
      );

      for (const [tool, id] of Object.entries({
        brush: "brush-button",
        eraser: "eraser-button",
        pan: "pan-button"
      })) {
        $(id).setAttribute(
          "aria-pressed", String(this.tool === tool)
        );
      }

      $("undo-button").disabled = this.history.length === 0;

      this.canvas.style.cursor =
        this.mode === "original" || this.tool === "pan"
          ? "grab"
          : "crosshair";

      $("editor-help").textContent =
        this.mode === "selection"
          ? "남길 부분을 칠해줘. 확대 후 ‘화면 이동’으로 위치를 조절할 수 있어."
          : this.hasTransparency
            ? "투명 배경을 유지해요. 드래그로 위치를 조절해줘."
            : "정사각형 안에 들어갈 부분을 골라줘. 드래그로 위치를 조절할 수 있어.";
    }

    getTransform() {
      const size = this.canvas.width;

      const fit =
        this.mode === "original" && !this.hasTransparency
          ? Math.max(
              size / this.source.width,
              size / this.source.height
            )
          : Math.min(
              size / this.source.width,
              size / this.source.height
            );

      const scale = fit * this.zoom;

      return {
        scale,
        x: (size - this.source.width * scale) / 2 + this.offsetX,
        y: (size - this.source.height * scale) / 2 + this.offsetY
      };
    }

    getPoint(event) {
      const rect = this.canvas.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) *
          this.canvas.width / rect.width,
        y: (event.clientY - rect.top) *
          this.canvas.height / rect.height
      };
    }

    toSourcePoint(point) {
      const transform = this.getTransform();

      return {
        x: (point.x - transform.x) / transform.scale,
        y: (point.y - transform.y) / transform.scale
      };
    }

    rememberMask() {
      this.history.push(
        this.maskCtx.getImageData(
          0, 0, this.mask.width, this.mask.height
        )
      );

      // 메모리 부담을 줄이기 위해 최근 6회만 보관합니다.
      if (this.history.length > 6) this.history.shift();

      this.updateControls();
    }

    undo() {
      if (!this.history.length || this.pointer) return;

      this.maskCtx.putImageData(this.history.pop(), 0, 0);
      this.dirty = true;

      this.updateControls();
      this.queueRender(true);
    }

    onPointerDown(event) {
      if (!this.ready || this.pointer) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();

      const point = this.getPoint(event);

      this.pointer = {
        id: event.pointerId,
        previous: point,
        action:
          this.mode === "original" || this.tool === "pan"
            ? "pan"
            : this.tool
      };

      this.canvas.setPointerCapture(event.pointerId);

      if (this.pointer.action !== "pan") {
        this.rememberMask();
        this.lastPoint = this.toSourcePoint(point);
        this.paint(this.lastPoint, this.lastPoint);
      }

      this.queueRender();
    }

    onPointerMove(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;

      event.preventDefault();

      const point = this.getPoint(event);

      if (this.pointer.action === "pan") {
        this.offsetX += point.x - this.pointer.previous.x;
        this.offsetY += point.y - this.pointer.previous.y;
        this.pointer.previous = point;
      } else {
        const sourcePoint = this.toSourcePoint(point);
        this.paint(this.lastPoint, sourcePoint);
        this.lastPoint = sourcePoint;
      }

      // 이동 이벤트마다 즉시 그리지 않고 다음 화면 갱신에 합칩니다.
      this.queueRender();
    }

    finishPointer(event) {
      if (!this.pointer) return;
      if (event && event.pointerId !== this.pointer.id) return;

      const id = this.pointer.id;

      this.pointer = null;
      this.lastPoint = null;

      if (this.canvas.hasPointerCapture(id)) {
        this.canvas.releasePointerCapture(id);
      }

      this.queueRender(true);
    }

    paint(from, to) {
      const radius = Number($("brush-size").value) /
        this.getTransform().scale / 2;

      const ctx = this.maskCtx;

      ctx.save();
      ctx.globalCompositeOperation =
        this.pointer.action === "eraser"
          ? "destination-out"
          : "source-over";

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      this.dirty = true;
    }

    getComposite() {
      if (!this.dirty) return this.composite;

      const ctx = this.compositeCtx;
      const width = this.source.width;
      const height = this.source.height;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(this.source, 0, 0);

      if (this.mode === "selection") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(this.mask, 0, 0);
        ctx.restore();
      }

      // 선택 표시도 새 캔버스 없이 기존 캔버스를 재사용합니다.
      const overlay = this.overlayCtx;

      overlay.clearRect(0, 0, width, height);
      overlay.fillStyle = "rgba(165, 91, 220, 0.32)";
      overlay.fillRect(0, 0, width, height);

      overlay.save();
      overlay.globalCompositeOperation = "destination-in";
      overlay.drawImage(this.composite, 0, 0);
      overlay.restore();

      this.dirty = false;
      return this.composite;
    }

    queueRender(forcePreview = false) {
      this.forcePreview = this.forcePreview || forcePreview;

      if (this.renderRequest !== null) return;

      this.renderRequest = requestAnimationFrame((now) => {
        this.renderRequest = null;

        const updatePreview =
          this.forcePreview || now - this.lastPreviewTime >= 100;

        this.forcePreview = false;
        this.render(updatePreview);

        if (updatePreview) this.lastPreviewTime = now;
      });
    }

    render(updatePreview = true) {
      if (!this.ready) return;

      const ctx = this.ctx;
      const size = this.canvas.width;
      const transform = this.getTransform();
      const composite = this.getComposite();

      const width = this.source.width * transform.scale;
      const height = this.source.height * transform.scale;

      ctx.fillStyle = this.checker;
      ctx.fillRect(0, 0, size, size);

      if (this.mode === "selection") {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          this.source, transform.x, transform.y, width, height
        );
        ctx.restore();

        ctx.drawImage(
          composite, transform.x, transform.y, width, height
        );

        ctx.drawImage(
          this.overlay, transform.x, transform.y, width, height
        );
      } else {
        ctx.drawImage(
          this.source, transform.x, transform.y, width, height
        );
      }

      if (updatePreview) {
        const preview = this.previewCtx;

        preview.clearRect(
          0, 0, this.preview.width, this.preview.height
        );

        preview.save();
        preview.scale(
          this.preview.width / size,
          this.preview.height / size
        );

        preview.drawImage(
          composite, transform.x, transform.y, width, height
        );

        preview.restore();
      }
    }

    makeVisibleCanvas() {
      const result = makeCanvas(600, 600);
      const transform = this.getTransform();

      result.getContext("2d").drawImage(
        this.getComposite(),
        transform.x,
        transform.y,
        this.source.width * transform.scale,
        this.source.height * transform.scale
      );

      return result;
    }

    exportImage() {
      if (!this.ready) throw new Error("먼저 사진을 선택해줘.");

      this.finishPointer();

      const visible = this.makeVisibleCanvas();
      const ctx = visible.getContext("2d", {
        willReadFrequently: true
      });

      const width = visible.width;
      const height = visible.height;
      const pixels = ctx.getImageData(0, 0, width, height).data;

      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] <= 8) continue;

          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }

      if (right < left || bottom < top) {
        throw new Error(
          this.mode === "selection"
            ? "남길 부분을 조금이라도 칠해줘."
            : "사진이 화면 밖에 있어. 위치 초기화를 눌러줘."
        );
      }

      if (this.mode === "original" && !this.hasTransparency) {
        return visible;
      }

      const cropped = makeCanvas(
        right - left + 1,
        bottom - top + 1
      );

      cropped.getContext("2d").drawImage(
        visible,
        left, top, cropped.width, cropped.height,
        0, 0, cropped.width, cropped.height
      );

      return cropped;
    }
  }

  window.ImageEditor = ImageEditor;
})();
