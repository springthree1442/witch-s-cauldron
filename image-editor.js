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

      this.bindEvents();
      this.updateControls();
    }

    tell(message) {
      $("status-message").textContent = message;
    }

    bindEvents() {
      $("use-original-button").addEventListener("click", () => {
        this.setMode("original");
      });

      $("select-region-button").addEventListener("click", () => {
        this.setMode("selection");
      });

      $("brush-button").addEventListener("click", () => {
        this.setTool("brush");
      });

      $("eraser-button").addEventListener("click", () => {
        this.setTool("eraser");
      });

      $("pan-button").addEventListener("click", () => {
        this.setTool("pan");
      });

      $("undo-button").addEventListener("click", () => {
        this.undo();
      });

      $("editor-zoom").addEventListener("input", (event) => {
        this.zoom = Number(event.target.value);
        this.render();
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

      this.canvas.addEventListener("pointerup", (event) => {
        this.finishPointer(event);
      });

      this.canvas.addEventListener("pointercancel", (event) => {
        this.finishPointer(event);
      });

      this.canvas.addEventListener("lostpointercapture", (event) => {
        this.finishPointer(event);
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
          image.onerror = () => {
            reject(new Error("사진을 읽지 못했어. 다른 사진을 선택해줘."));
          };
          image.src = url;
        });

        if (version !== this.loadVersion) return false;

        /*
         * 큰 사진은 편집용으로 축소합니다.
         * 원본 파일 자체는 변경하지 않습니다.
         */
        const ratio = Math.min(
          1,
          1000 / Math.max(image.naturalWidth, image.naturalHeight)
        );

        const width = Math.max(
          1,
          Math.round(image.naturalWidth * ratio)
        );

        const height = Math.max(
          1,
          Math.round(image.naturalHeight * ratio)
        );

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

        this.mode = "original";
        this.tool = "brush";
        this.history = [];
        this.pointer = null;
        this.lastPoint = null;
        this.ready = true;

        this.resetView();
        this.updateControls();

        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    setMode(mode) {
      if (!this.ready || this.pointer) return;
      if (mode === this.mode) return;

      this.mode = mode;
      this.tool = "brush";

      /*
       * 모드를 바꿔도 기존에 칠한 영역은 보관합니다.
       * 새 사진을 선택하면 선택 영역이 초기화됩니다.
       */
      this.resetView();
      this.updateControls();
    }

    setTool(tool) {
      if (this.pointer) return;
      this.tool = tool;
      this.updateControls();
    }

    resetView() {
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      $("editor-zoom").value = "1";
      this.render();
    }

    updateControls() {
      $("editor-tools").hidden = this.mode !== "selection";

      $("use-original-button").setAttribute(
        "aria-pressed",
        String(this.mode === "original")
      );

      $("select-region-button").setAttribute(
        "aria-pressed",
        String(this.mode === "selection")
      );

      const tools = {
        brush: "brush-button",
        eraser: "eraser-button",
        pan: "pan-button"
      };

      for (const [tool, id] of Object.entries(tools)) {
        $(id).setAttribute(
          "aria-pressed",
          String(this.tool === tool)
        );
      }

      $("undo-button").disabled = this.history.length === 0;

      this.canvas.style.cursor =
        this.mode === "original" || this.tool === "pan"
          ? "grab"
          : "crosshair";

      $("editor-help").textContent =
        this.mode === "selection"
          ? "残す".replace(
              "残す",
              "남길 부분을 칠해줘. 색 표시 밖은 투명해져. 확대 후 화면 이동으로 위치를 조절할 수 있어."
            )
          : this.hasTransparency
            ? "투명 배경을 유지해요. 드래그로 위치를, 확대 슬라이더로 크기를 조절해줘."
            : "정사각형 틀에 들어갈 부분을 골라줘. 드래그로 위치를, 확대 슬라이더로 크기를 조절할 수 있어.";
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

      // メモリではなく、編集履歴の上限です。
      // 最後の8回分まで戻せます。
      if (this.history.length > 8) {
        this.history.shift();
      }

      this.updateControls();
    }

    undo() {
      if (!this.history.length || this.pointer) return;

      this.maskCtx.putImageData(this.history.pop(), 0, 0);
      this.updateControls();
      this.render();
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

      this.render();
    }

    finishPointer(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;

      this.pointer = null;
      this.lastPoint = null;

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.render();
    }

    paint(from, to) {
      const transform = this.getTransform();
      const radius = Number($("brush-size").value) /
        transform.scale / 2;

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
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      this.render();
    }

    getComposite() {
      const ctx = this.compositeCtx;

      ctx.clearRect(
        0, 0, this.composite.width, this.composite.height
      );

      ctx.drawImage(this.source, 0, 0);

      if (this.mode === "selection") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(this.mask, 0, 0);
        ctx.restore();
      }

      return this.composite;
    }

    drawCheckerboard(ctx, width, height) {
      const cell = 20;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#e8e3eb";

      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          if ((x / cell + y / cell) % 2 === 0) {
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
    }

    /*
     * 현재 보이는 정사각형 영역을 투명 캔버스로 만듭니다.
     * 선택 영역과 원본 사진의 투명도가 함께 적용됩니다.
     */
    makeVisibleCanvas() {
      const result = makeCanvas(600, 600);
      const ctx = result.getContext("2d");
      const transform = this.getTransform();

      ctx.drawImage(
        this.getComposite(),
        transform.x,
        transform.y,
        this.source.width * transform.scale,
        this.source.height * transform.scale
      );

      return result;
    }

    render() {
      if (!this.ready) return;

      const ctx = this.ctx;
      const size = this.canvas.width;
      const transform = this.getTransform();

      this.drawCheckerboard(ctx, size, size);

      if (this.mode === "selection") {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          this.source,
          transform.x,
          transform.y,
          this.source.width * transform.scale,
          this.source.height * transform.scale
        );
        ctx.restore();

        const selected = this.getComposite();

        ctx.drawImage(
          selected,
          transform.x,
          transform.y,
          this.source.width * transform.scale,
          this.source.height * transform.scale
        );

        /*
         * 選択した領域の色表示。
         * 元画像の透明部分には色を付けません。
         */
        const overlay = this.compositeCtx;
        overlay.save();
        overlay.globalCompositeOperation = "source-atop";
        overlay.fillStyle = "rgba(165, 91, 220, 0.32)";
        overlay.fillRect(
          0, 0, this.composite.width, this.composite.height
        );
        overlay.restore();

        ctx.drawImage(
          this.composite,
          transform.x,
          transform.y,
          this.source.width * transform.scale,
          this.source.height * transform.scale
        );
      } else {
        ctx.drawImage(
          this.source,
          transform.x,
          transform.y,
          this.source.width * transform.scale,
          this.source.height * transform.scale
        );
      }

      this.previewCtx.clearRect(
        0, 0, this.preview.width, this.preview.height
      );

      this.previewCtx.drawImage(
        this.makeVisibleCanvas(),
        0, 0,
        this.preview.width,
        this.preview.height
      );
    }

    /*
     * app.js에서 호출할 함수.
     * 결과는 HTMLCanvasElement입니다.
     */
    exportImage() {
      if (!this.ready) {
        throw new Error("먼저 사진을 선택해줘.");
      }

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
          const alpha = pixels[(y * width + x) * 4 + 3];

          if (alpha > 8) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }

      if (right < left || bottom < top) {
        throw new Error(
          this.mode === "selection"
            ? "남길 부분을 조금이라도 칠해줘."
            : "사진이 화면 밖에 있어. 위치 초기화를 눌러줘."
        );
      }

      /*
       * 일반 사진을 그대로 쓰면 정사각형 유지.
       * 오린 사진과 투명 사진은 빈 여백만 잘라냅니다.
       */
      if (this.mode === "original" && !this.hasTransparency) {
        return visible;
      }

      const cropped = makeCanvas(
        right - left + 1,
        bottom - top + 1
      );

      cropped.getContext("2d").drawImage(
        visible,
        left, top,
        cropped.width, cropped.height,
        0, 0,
        cropped.width, cropped.height
      );

      return cropped;
    }
  }

  window.ImageEditor = ImageEditor;
})();
