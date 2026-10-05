(() => {
  "use strict";

  const TAU = Math.PI * 2;

  const PARTS = [
    { id: "pumpkin", name: "호박", color: "#f49a45" },
    { id: "pumpkinFace", name: "얼굴 호박", color: "#f49a45" },
    { id: "hat", name: "마녀 모자", color: "#7850a3" },
    { id: "ghost", name: "유령", color: "#fffaf5" },
    { id: "star", name: "별", color: "#f5d65c" },
    { id: "heart", name: "하트", color: "#ed8cae" }
  ];

  /*
   * PNG를 준비하면 아래 경로와 같은 이름으로 올려주세요.
   * 파일이 없으면 코드로 그린 임시 파츠가 표시됩니다.
   */
  const PNG_PATHS = {
    pumpkin: "./assets/pumpkin.png",
    pumpkinFace: "./assets/pumpkin-face.png",
    hat: "./assets/witch-hat.png",
    ghost: "./assets/ghost.png"
  };

  const assets = {};
  const assetLoads = Object.entries(PNG_PATHS).map(([type, path]) => {
    return new Promise((resolve) => {
      const image = new Image();

      image.onload = () => {
        assets[type] = image;
        resolve();
      };

      image.onerror = () => resolve();
      image.src = path;
    });
  });

  function canvas(width, height) {
    const result = document.createElement("canvas");
    result.width = width;
    result.height = height;
    return result;
  }

  function randomGenerator(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;

      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);

      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function drawPart(ctx, type, x, y, size, color, angle = 0, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha *= alpha;

    const image = assets[type];

    if (image) {
      const ratio = size / Math.max(image.width, image.height);

      ctx.drawImage(
        image,
        -image.width * ratio / 2,
        -image.height * ratio / 2,
        image.width * ratio,
        image.height * ratio
      );

      ctx.restore();
      return;
    }

    ctx.scale(size / 40, size / 40);
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#48324f";

    if (type === "pumpkin" || type === "pumpkinFace") {
      ctx.fillStyle = "#65815b";
      ctx.fillRect(-3, -19, 6, 9);

      ellipse(ctx, -9, 2, 10, 14, "#e77e2e");
      ellipse(ctx, 9, 2, 10, 14, "#e77e2e");
      ellipse(ctx, 0, 2, 12, 15, "#f49a45");

      if (type === "pumpkinFace") {
        ctx.fillStyle = "#382743";

        ctx.beginPath();
        ctx.moveTo(-13, 0);
        ctx.lineTo(-6, -4);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(6, -4);
        ctx.lineTo(6, 3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-10, 7);
        ctx.lineTo(-4, 10);
        ctx.lineTo(0, 6);
        ctx.lineTo(4, 10);
        ctx.lineTo(10, 7);
        ctx.lineTo(6, 13);
        ctx.lineTo(-6, 13);
        ctx.closePath();
        ctx.fill();
      }
    } else if (type === "hat") {
      ctx.fillStyle = "#7850a3";
      ctx.beginPath();
      ctx.moveTo(-13, 9);
      ctx.lineTo(1, -20);
      ctx.lineTo(9, -14);
      ctx.lineTo(7, -12);
      ctx.lineTo(14, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f49a45";
      ctx.fillRect(-10, 4, 22, 5);

      ellipse(ctx, 0, 12, 20, 5, "#593779");

      ctx.fillStyle = "#f5d65c";
      ctx.fillRect(-1, 4, 5, 5);
    } else if (type === "ghost") {
      ctx.fillStyle = "#fffaf5";
      ctx.beginPath();
      ctx.moveTo(-15, 17);
      ctx.lineTo(-15, -2);
      ctx.bezierCurveTo(-15, -23, 15, -23, 15, -2);
      ctx.lineTo(15, 17);
      ctx.lineTo(8, 11);
      ctx.lineTo(1, 17);
      ctx.lineTo(-6, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ellipse(ctx, -5, -1, 2, 3, "#382743");
      ellipse(ctx, 5, -1, 2, 3, "#382743");
      ellipse(ctx, 0, 7, 2.4, 3, "#382743");
    } else if (type === "star") {
      ctx.fillStyle = color;
      ctx.beginPath();

      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? 19 : 8;

        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.closePath();
      ctx.fill();
    } else if (type === "heart") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.bezierCurveTo(-30, -2, -15, -26, 0, -10);
      ctx.bezierCurveTo(15, -26, 30, -2, 0, 17);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBottle(ctx, type, color, level = 0) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width / 90, height / 120);

    ctx.fillStyle = "#b18b73";
    ctx.fillRect(32, 5, 26, 15);

    ctx.fillStyle = "#edf3f4";
    ctx.strokeStyle = "#82718f";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(31, 20);
    ctx.lineTo(31, 33);
    ctx.bezierCurveTo(31, 39, 17, 41, 17, 52);
    ctx.lineTo(17, 101);
    ctx.quadraticCurveTo(17, 110, 26, 110);
    ctx.lineTo(64, 110);
    ctx.quadraticCurveTo(73, 110, 73, 101);
    ctx.lineTo(73, 52);
    ctx.bezierCurveTo(73, 41, 59, 39, 59, 33);
    ctx.lineTo(59, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(25, 55);
    ctx.lineTo(25, 92);
    ctx.stroke();

    drawPart(ctx, type, 45, 74, 35, color);

    if (level > 0) {
      for (let i = 0; i < 3; i++) {
        ellipse(
          ctx, 35 + i * 10, 100, 3, 3,
          i < level ? "#9152c7" : "#d7cbdc"
        );
      }
    }

    ctx.restore();
  }

  class WitchScene {
    constructor(element) {
      this.canvas = element;
      this.ctx = element.getContext("2d");

      this.image = null;
      this.ingredients = [];
      this.amounts = {};
      this.result = null;
      this.effects = [];
      this.state = "selecting";
      this.animationStart = 0;
      this.animationResolve = null;
      this.duration = 6;
      this.disposed = false;

      this.tick = this.tick.bind(this);
      this.frameId = requestAnimationFrame(this.tick);
    }

    async waitForAssets() {
      await Promise.all(assetLoads);
    }

    setImage(image) {
      this.image = image;
      this.resetIngredients();
    }

    resetIngredients() {
      this.cancelAnimation();
      this.ingredients = [];
      this.amounts = {};
      this.result = null;
      this.effects = [];
      this.state = "selecting";
    }

    cancelAnimation() {
      if (this.animationResolve) {
        this.animationResolve(false);
        this.animationResolve = null;
      }
    }

    /*
     * amount는 이번에 부은 시간(초)입니다.
     * 종류별 총 4초까지만 쌓입니다.
     * 색을 바꿔도 이미 넣은 재료의 색은 유지됩니다.
     */
    pour(type, color, amount) {
      if (this.state !== "selecting") return 0;
      if (!PARTS.some((part) => part.id === type)) return 0;
      if (!Number.isFinite(amount) || amount <= 0) return this.getLevel(type);

      const previous = this.amounts[type] || 0;
      const accepted = Math.min(amount, Math.max(0, 4 - previous));

      if (accepted <= 0) return this.getLevel(type);

      this.amounts[type] = previous + accepted;

      const last = this.ingredients[this.ingredients.length - 1];

      if (last && last.type === type && last.color === color) {
        last.weight += accepted;
      } else {
        this.ingredients.push({ type, color, weight: accepted });
      }

      return this.getLevel(type);
    }

    getLevel(type) {
      const amount = this.amounts[type] || 0;
      if (amount <= 0) return 0;
      if (amount < 2) return 1;
      if (amount < 4) return 2;
      return 3;
    }

    hasIngredients() {
      return this.ingredients.length > 0;
    }

    /*
     * 정규화된 600×600 장면 기준 솥 입구입니다.
     * app.js에서 병이 이 안에 들어왔는지 판단합니다.
     */
    isPourTarget(x, y) {
      return x >= 165 && x <= 435 && y >= 285 && y <= 390;
    }

    chooseColor(type, random) {
      const choices = this.ingredients.filter(
        (ingredient) => ingredient.type === type
      );

      const total = choices.reduce((sum, item) => sum + item.weight, 0);
      let position = random() * total;

      for (const item of choices) {
        position -= item.weight;
        if (position <= 0) return item.color;
      }

      return choices[choices.length - 1].color;
    }

    /*
     * 최종 이미지:
     * 480×480 투명 캔버스 안에 여백을 확보합니다.
     * 사진의 알파값을 읽어 실제 윤곽을 찾습니다.
     */
    buildResult() {
      if (!this.image || !this.hasIngredients()) {
        throw new Error("사진과 마법 재료를 먼저 넣어줘.");
      }

      const seed = Math.floor(Math.random() * 4294967295);
      const random = randomGenerator(seed);

      const result = canvas(480, 480);
      const ctx = result.getContext("2d");

      const base = canvas(480, 480);
      const baseCtx = base.getContext("2d", {
        willReadFrequently: true
      });

      const scale = Math.min(
        320 / this.image.width,
        320 / this.image.height
      );

      const width = this.image.width * scale;
      const height = this.image.height * scale;

      baseCtx.drawImage(
        this.image,
        240 - width / 2,
        240 - height / 2,
        width,
        height
      );

      const pixels = baseCtx.getImageData(0, 0, 480, 480).data;
      const alphaAt = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);

        if (x < 0 || y < 0 || x >= 480 || y >= 480) return 0;
        return pixels[(y * 480 + x) * 4 + 3];
      };

      const edges = [];

      for (let y = 2; y < 478; y += 2) {
        for (let x = 2; x < 478; x += 2) {
          if (alphaAt(x, y) < 100) continue;

          const left = alphaAt(x - 2, y);
          const right = alphaAt(x + 2, y);
          const top = alphaAt(x, y - 2);
          const bottom = alphaAt(x, y + 2);

          if (Math.min(left, right, top, bottom) >= 100) continue;

          let nx = left - right;
          let ny = top - bottom;
          let length = Math.hypot(nx, ny);

          if (length < 1) {
            nx = x - 240;
            ny = y - 240;
            length = Math.hypot(nx, ny) || 1;
          }

          edges.push({ x, y, nx: nx / length, ny: ny / length });
        }
      }

      if (!edges.length) {
        throw new Error("이미지 윤곽을 찾지 못했어. 오리기 영역을 확인해줘.");
      }

      const outside = [];
      const inside = [];

      for (const part of PARTS) {
        const level = this.getLevel(part.id);
        if (!level) continue;

        // 총 장식 수는 최대 72개입니다.
        const count = [0, 4, 8, 12][level];

        for (let i = 0; i < count; i++) {
          const internal = level === 3 && i >= count - 2;
          const around = level >= 2 && !internal && i % 2 === 1;

          let placement = null;

          for (let attempt = 0; attempt < 35; attempt++) {
            const edge = edges[Math.floor(random() * edges.length)];
            const distance = internal
              ? -(8 + random() * 15)
              : around
                ? 22 + random() * 22
                : -2 + random() * 7;

            const x = edge.x + edge.nx * distance;
            const y = edge.y + edge.ny * distance;

            if (x < 24 || x > 456 || y < 24 || y > 456) continue;
            if (internal && alphaAt(x, y) < 100) continue;
            if (around && alphaAt(x, y) >= 100) continue;

            const existing = internal ? inside : outside;

            if (existing.some((item) => Math.hypot(
              item.x - x, item.y - y
            ) < 18)) continue;

            placement = {
              type: part.id,
              color: this.chooseColor(part.id, random),
              x,
              y,
              size: internal ? 18 + random() * 7 : 23 + random() * 10,
              angle: (random() - 0.5) * 1.2,
              alpha: internal ? 0.3 + random() * 0.2 : 1
            };

            break;
          }

          if (placement) {
            (internal ? inside : outside).push(placement);
          }
        }
      }

      ctx.drawImage(base, 0, 0);

      // 안쪽 장식은 사진 영역 밖으로 넘치지 않도록 잘라냅니다.
      const innerLayer = canvas(480, 480);
      const innerCtx = innerLayer.getContext("2d");

      for (const item of inside) {
        drawPart(
          innerCtx, item.type, item.x, item.y,
          item.size, item.color, item.angle, item.alpha
        );
      }

      innerCtx.globalCompositeOperation = "destination-in";
      innerCtx.drawImage(base, 0, 0);

      ctx.drawImage(innerLayer, 0, 0);

      for (const item of outside) {
        drawPart(
          ctx, item.type, item.x, item.y,
          item.size, item.color, item.angle
        );
      }

      this.result = result;

      /*
       * 등장 효과는 미리 계산합니다.
       * 화면 재생과 GIF 저장에서 같은 효과를 사용합니다.
       */
      this.effects = [];

      for (let i = 0; i < 30; i++) {
        const ingredient = this.ingredients[
          Math.floor(random() * this.ingredients.length)
        ];

        this.effects.push({
          type: ingredient.type,
          color: ingredient.color,
          vx: (random() - 0.5) * 420,
          vy: -150 - random() * 220,
          size: 18 + random() * 13,
          spin: (random() - 0.5) * 8,
          offset: random()
        });
      }

      return result;
    }

    async startMix() {
      await this.waitForAssets();

      if (this.state === "mixing") return false;

      this.buildResult();
      this.state = "mixing";
      this.animationStart = performance.now();

      return new Promise((resolve) => {
        this.animationResolve = resolve;
      });
    }

    tick(now) {
      if (this.disposed) return;

      let time = -1;

      if (this.state === "mixing") {
        time = (now - this.animationStart) / 1000;

        if (time >= this.duration) {
          this.state = "result";
          time = this.duration;

          if (this.animationResolve) {
            this.animationResolve(true);
            this.animationResolve = null;
          }
        }
      } else if (this.state === "result") {
        time = this.duration;
      }

      this.renderFrame(this.ctx, time, this.canvas.width, this.canvas.height);
      this.frameId = requestAnimationFrame(this.tick);
    }

    drawContents(ctx, time) {
      ctx.save();

      ctx.beginPath();
      ctx.ellipse(300, 345, 126, 35, 0, 0, TAU);
      ctx.clip();

      const mixing = time >= 1 && time < 3.5;
      const angle = mixing ? (time - 1) * 9 : 0;

      if (this.image) {
        ctx.save();
        ctx.translate(300, 343);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.85;

        const scale = 66 / Math.max(
          this.image.width, this.image.height
        );

        ctx.drawImage(
          this.image,
          -this.image.width * scale / 2,
          -this.image.height * scale / 2,
          this.image.width * scale,
          this.image.height * scale
        );

        ctx.restore();
      }

      let index = 0;

      for (const part of PARTS) {
        const amount = this.amounts[part.id] || 0;
        if (!amount) continue;

        const count = Math.min(16, 3 + Math.floor(amount * 3));

        for (let i = 0; i < count; i++) {
          const a = index * 2.4 + angle;
          const radius = 28 + index % 5 * 17;

          const colors = this.ingredients.filter(
            (item) => item.type === part.id
          );

          const color = colors[i % colors.length].color;

          drawPart(
            ctx, part.id,
            300 + Math.cos(a) * radius,
            343 + Math.sin(a) * 20,
            17 + i % 3 * 3,
            color,
            a * 0.3
          );

          index++;
        }
      }

      ctx.restore();
    }

    drawCauldron(ctx, time) {
      // 솥 다리
      ctx.fillStyle = "#382743";
      ctx.fillRect(203, 468, 26, 28);
      ctx.fillRect(370, 468, 26, 28);

      // 손잡이
      ctx.strokeStyle = "#48324f";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.ellipse(160, 393, 17, 26, 0, 0, TAU);
      ctx.ellipse(440, 393, 17, 26, 0, 0, TAU);
      ctx.stroke();

      // 솥 몸체
      ctx.fillStyle = "#48324f";
      ctx.beginPath();
      ctx.moveTo(166, 348);
      ctx.bezierCurveTo(140, 475, 193, 487, 300, 487);
      ctx.bezierCurveTo(407, 487, 460, 475, 434, 348);
      ctx.closePath();
      ctx.fill();

      // 솥 입구와 액체
      ellipse(ctx, 300, 345, 143, 43, "#382743");
      ellipse(ctx, 300, 345, 126, 35, "#b6a0cb");

      if (time < 3.5) this.drawContents(ctx, time);

      // 앞쪽 테두리
      ctx.strokeStyle = "#382743";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.ellipse(300, 345, 139, 40, 0, 0, Math.PI);
      ctx.stroke();

      // 솥 앞 별 문양
      drawPart(ctx, "star", 300, 430, 36, "#f49a45");

      // 국자
      if (time >= 1 && time < 3.5) {
        const angle = (time - 1) * 9;
        const x = 300 + Math.cos(angle) * 62;
        const y = 343 + Math.sin(angle) * 18;

        ctx.strokeStyle = "#b18b73";
        ctx.lineWidth = 13;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 48, y - 107);
        ctx.stroke();

        ellipse(ctx, x, y, 19, 8, "#d0ab8c");
      }
    }

    drawReveal(ctx, time) {
      if (!this.result || time < 3.5) return;

      const elapsed = time - 3.5;
      const progress = clamp(elapsed, 0, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      // 先に煙、その後ろから完成画像が上がります。
      if (elapsed < 1.3) {
        const smokeAlpha = 1 - elapsed / 1.3;

        for (let i = 0; i < 9; i++) {
          const angle = i * TAU / 9;
          const radius = 30 + elapsed * 110;

          ctx.save();
          ctx.globalAlpha = smokeAlpha * 0.7;

          ellipse(
            ctx,
            300 + Math.cos(angle) * radius,
            320 + Math.sin(angle) * radius * 0.5 - elapsed * 45,
            28 + elapsed * 22,
            24 + elapsed * 18,
            i % 2 ? "#d7c3e9" : "#ffffff"
          );

          ctx.restore();
        }
      }

      const size = 80 + ease * 250;
      const y = 338 - ease * 150;

      ctx.save();
      ctx.globalAlpha = clamp(elapsed * 3, 0, 1);
      ctx.drawImage(this.result, 300 - size / 2, y - size / 2, size, size);
      ctx.restore();

      // 실제 넣은 종류·색의 파츠가 팡 튀는 효과
      if (elapsed < 1.15) {
        for (const item of this.effects) {
          drawPart(
            ctx, item.type,
            300 + item.vx * elapsed,
            335 + item.vy * elapsed + 145 * elapsed * elapsed,
            item.size,
            item.color,
            item.spin * elapsed,
            clamp(1 - elapsed / 1.15, 0, 1)
          );
        }
      }

      if (elapsed >= 1) {
        ctx.fillStyle = "#7850a3";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("짜잔!", 300, 42);
      }
    }

    /*
     * time:
     * -1 : 재료 선택 화면
     * 0~6 : GIF와 화면에 공통으로 쓰는 완성 연출
     */
    renderFrame(ctx, time, width = 600, height = 600) {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#fffaf5";
      ctx.fillRect(0, 0, width, height);

      const scale = Math.min(width, height) / 600;
      ctx.translate(
        (width - 600 * scale) / 2,
        (height - 600 * scale) / 2
      );
      ctx.scale(scale, scale);

      this.drawCauldron(ctx, time);
      this.drawReveal(ctx, time);

      if (!this.image) {
        ctx.fillStyle = "#786682";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("사진을 기다리는 중", 300, 250);
      }

      ctx.restore();
    }

    getResultCanvas() {
      if (!this.result) {
        throw new Error("먼저 솥을 섞어서 완성해줘.");
      }
      return this.result;
    }

    dispose() {
      this.disposed = true;
      cancelAnimationFrame(this.frameId);
      this.cancelAnimation();
    }
  }

  window.WitchParts = PARTS;
  window.WitchScene = WitchScene;
  window.drawWitchPart = drawPart;
  window.drawWitchBottle = drawBottle;
})();
