(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function initialize() {
    if (
      !window.ImageEditor ||
      !window.WitchScene ||
      !window.exportWitchGif
    ) {
      $("status-message").textContent =
        "기능 파일을 불러오지 못했어. 파일 이름과 저장 상태를 확인해줘.";
      return;
    }

    const editor = new ImageEditor();
    const scene = new WitchScene($("scene-canvas"));

    const colors = Object.fromEntries(
      WitchParts.map((part) => [part.id, part.color])
    );

    const bottles = new Map();

    let stage = "upload";
    let busy = false;
    let activeColor = null;
    let drag = null;
    let gifUrl = null;
    let fileVersion = 0;

    const effectElements = new Set();

    function tell(message = "") {
      $("status-message").textContent = message;
    }

    function setPressed(id, pressed) {
      $(id).setAttribute("aria-pressed", String(pressed));
    }

    function clearGif() {
      $("gif-preview").removeAttribute("src");
      $("gif-download").removeAttribute("href");
      $("gif-result").hidden = true;

      if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        gifUrl = null;
      }

      $("export-status").hidden = true;
      $("export-progress").value = 0;
    }

    function updateButtons() {
      const selecting = stage === "selecting";
      const confirmed = stage === "confirmed";
      const result = stage === "result";

      $("confirm-button").hidden = !selecting;
      $("confirm-button").disabled =
        busy || !scene.hasIngredients();

      $("mix-button").hidden = !confirmed;
      $("mix-button").disabled = busy;

      $("result-actions").hidden = !result;

      for (const id of [
        "remix-button",
        "save-png-button",
        "save-gif-button",
        "restart-button",
        "reselect-button",
        "editor-reselect-button",
        "put-image-button"
      ]) {
        $(id).disabled = busy;
      }

      $("image-input").disabled = busy;

      for (const bottle of bottles.values()) {
        bottle.button.disabled = busy || !selecting;

        if (bottle.colorButton) {
          bottle.colorButton.disabled = busy || !selecting;
        }
      }

      if (!selecting || busy) {
        $("color-panel").hidden = true;
      }

      if (stage === "selecting") {
        $("stage-title").textContent = "마법 재료를 넣어줘";
        $("stage-help").textContent =
          "병을 솥 입구로 끌어가면 재료가 쏟아져요. 2초·4초에 양이 늘어나요.";
      } else if (stage === "confirmed") {
        $("stage-title").textContent = "마법 준비 완료";
        $("stage-help").textContent =
          "섞기! 버튼을 눌러 어떤 모습이 나오는지 확인해줘.";
      } else if (stage === "mixing") {
        $("stage-title").textContent = "마법을 섞는 중";
        $("stage-help").textContent = "곧 솥에서 완성 이미지가 나와요.";
      } else if (stage === "result") {
        $("stage-title").textContent = "짜잔! 완성됐어";
        $("stage-help").textContent =
          "다시 섞으면 같은 재료로 장식 위치만 바뀌어요.";
      }
    }

    function refreshBottles() {
      for (const part of WitchParts) {
        const bottle = bottles.get(part.id);
        if (!bottle) continue;

        const level = scene.getLevel(part.id);

        drawWitchBottle(
          bottle.canvas.getContext("2d"),
          part.id,
          colors[part.id],
          level
        );

        bottle.level.textContent =
          level === 0 ? "아직 안 넣었어" : `${level}단계`;

        bottle.button.setAttribute(
          "aria-label",
          `${part.name} 병, ${
            level === 0 ? "미사용" : `${level}단계`
          }. 솥으로 드래그해서 넣기`
        );

        if (bottle.dot) {
          bottle.dot.style.backgroundColor = colors[part.id];
        }
      }
    }

    function createBottles() {
      const shelf = $("bottle-shelf");
      shelf.replaceChildren();

      for (const part of WitchParts) {
        const item = document.createElement("div");
        item.className = "bottle-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "bottle-button";
        button.draggable = false;

        const picture = document.createElement("canvas");
        picture.width = 90;
        picture.height = 120;
        picture.setAttribute("aria-hidden", "true");

        button.append(picture);

        const name = document.createElement("span");
        name.className = "bottle-name";
        name.textContent = part.name;

        const level = document.createElement("span");
        level.className = "bottle-level";

        item.append(button, name, level);

        const bottle = {
          button,
          canvas: picture,
          level,
          colorButton: null,
          dot: null
        };

        if (part.id === "star" || part.id === "heart") {
          const colorButton = document.createElement("button");
          colorButton.type = "button";
          colorButton.className = "part-color-button";
          colorButton.setAttribute(
            "aria-label", `${part.name} 색 고르기`
          );

          const dot = document.createElement("span");
          dot.className = "color-dot";
          dot.setAttribute("aria-hidden", "true");

          colorButton.append(dot, document.createTextNode("색"));

          colorButton.addEventListener("click", () => {
            openColor(part.id);
          });

          item.append(colorButton);
          bottle.colorButton = colorButton;
          bottle.dot = dot;
        }

        button.addEventListener("pointerdown", (event) => {
          beginDrag(event, part.id);
        });

        button.addEventListener("pointermove", moveDrag);
        button.addEventListener("pointerup", endDrag);
        button.addEventListener("pointercancel", endDrag);
        button.addEventListener("lostpointercapture", endDrag);

        button.addEventListener("dragstart", (event) => {
          event.preventDefault();
        });

        /*
         * 키보드 사용자를 위한 대체 조작.
         * Enter 또는 Space를 누르면 한 단계씩 추가합니다.
         */
        button.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;

          event.preventDefault();

          if (event.repeat || busy || stage !== "selecting") return;

          const current = scene.amounts[part.id] || 0;

          if (current >= 4) {
            tell(`${part.name}은 이미 3단계까지 넣었어.`);
            return;
          }

          const target = current === 0 ? 0.01 : current < 2 ? 2 : 4;

          scene.pour(
            part.id,
            colors[part.id],
            target - current
          );

          refreshBottles();
          updateButtons();
          tell(`${part.name} ${scene.getLevel(part.id)}단계 추가!`);
        });

        bottles.set(part.id, bottle);
        shelf.append(item);
      }

      refreshBottles();

      scene.waitForAssets().then(refreshBottles);
    }

    function openColor(type) {
      if (busy || stage !== "selecting" || drag) return;

      activeColor = type;

      const name = WitchParts.find((part) => part.id === type).name;
      $("color-title").textContent = `${name} 색 고르기`;

      const match = colors[type].match(
        /hsl\(([\d.]+),\s*85%,\s*([\d.]+)%\)/
      );

      $("part-hue").value = match
        ? match[1]
        : type === "star" ? 45 : 340;

      $("part-lightness").value = match ? match[2] : 65;
      $("color-preview").style.backgroundColor = colors[type];

      $("color-panel").hidden = false;
    }

    function changeColor() {
      if (!activeColor || busy || stage !== "selecting") return;

      colors[activeColor] =
        `hsl(${$("part-hue").value}, 85%, ${
          $("part-lightness").value
        }%)`;

      $("color-preview").style.backgroundColor = colors[activeColor];
      refreshBottles();
    }

    $("part-hue").addEventListener("input", changeColor);
    $("part-lightness").addEventListener("input", changeColor);

    $("close-color-button").addEventListener("click", () => {
      $("color-panel").hidden = true;
      activeColor = null;
    });

    function scenePoint(clientX, clientY) {
      const rect = $("scene-canvas").getBoundingClientRect();

      return {
        x: (clientX - rect.left) * 600 / rect.width,
        y: (clientY - rect.top) * 600 / rect.height
      };
    }

    function positionDrag() {
      if (!drag) return;

      drag.picture.style.left = `${drag.x - 38}px`;
      drag.picture.style.top = `${drag.y - 53}px`;

      drag.picture.style.transform =
        drag.pouring ? "rotate(155deg)" : "rotate(0deg)";

      const gaugeWidth = 116;
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - gaugeWidth - 8,
          drag.x + 42
        )
      );

      const top = Math.max(
        8,
        Math.min(window.innerHeight - 70, drag.y - 30)
      );

      $("pour-gauge").style.left = `${left}px`;
      $("pour-gauge").style.top = `${top}px`;
    }

    function beginDrag(event, type) {
      if (busy || stage !== "selecting" || drag) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      $("color-panel").hidden = true;

      const button = bottles.get(type).button;
      const picture = document.createElement("canvas");

      picture.width = 90;
      picture.height = 120;
      picture.className = "drag-bottle";

      drawWitchBottle(
        picture.getContext("2d"),
        type,
        colors[type],
        scene.getLevel(type)
      );

      document.body.append(picture);
      button.classList.add("is-dragging");

      drag = {
        id: event.pointerId,
        type,
        button,
        picture,
        x: event.clientX,
        y: event.clientY,
        pouring: false,
        lastTime: performance.now(),
        lastParticle: 0,
        frameId: null
      };

      button.setPointerCapture(event.pointerId);

      positionDrag();
      drag.frameId = requestAnimationFrame(dragTick);
    }

    function moveDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;

      event.preventDefault();

      drag.x = event.clientX;
      drag.y = event.clientY;

      positionDrag();
    }

    /*
     * 원본 프레임 저장과는 별개인,
     * 병에서 파츠가 떨어지는 화면 효과입니다.
     */
    function sprinkle(type, color, x, y) {
      if (effectElements.size >= 24) return;

      const particle = document.createElement("canvas");
      particle.width = 40;
      particle.height = 40;

      particle.style.cssText =
        "position:fixed;width:24px;height:24px;" +
        "pointer-events:none;z-index:105;";

      particle.style.left = `${x - 12}px`;
      particle.style.top = `${y - 12}px`;

      drawWitchPart(
        particle.getContext("2d"),
        type, 20, 20, 34, color
      );

      document.body.append(particle);
      effectElements.add(particle);

      const rect = $("scene-canvas").getBoundingClientRect();

      const targetX =
        rect.left + rect.width * (0.5 + (Math.random() - 0.5) * 0.16);

      const targetY = rect.top + rect.height * 345 / 600;

      const cleanup = () => {
        particle.remove();
        effectElements.delete(particle);
      };

      if (typeof particle.animate !== "function") {
        cleanup();
        return;
      }

      const animation = particle.animate([
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        {
          transform:
            `translate(${targetX - x}px, ${targetY - y}px) rotate(180deg)`,
          opacity: 0
        }
      ], {
        duration: 430,
        easing: "ease-in",
        fill: "forwards"
      });

      animation.finished.then(cleanup, cleanup);
    }

    function dragTick(now) {
      if (!drag) return;

      const dt = Math.min(0.1, Math.max(0, (now - drag.lastTime) / 1000));
      drag.lastTime = now;

      const point = scenePoint(drag.x, drag.y);
      const overPot = scene.isPourTarget(point.x, point.y);

      drag.pouring = overPot;
      $("pour-gauge").hidden = !overPot;

      if (overPot) {
        const before = scene.amounts[drag.type] || 0;

        if (before < 4) {
          scene.pour(drag.type, colors[drag.type], dt);

          if (now - drag.lastParticle > 130) {
            sprinkle(
              drag.type,
              colors[drag.type],
              drag.x,
              drag.y
            );

            drag.lastParticle = now;
          }
        }

        const amount = scene.amounts[drag.type] || 0;
        const level = scene.getLevel(drag.type);

        $("gauge-fill").style.width =
          `${Math.min(100, amount / 4 * 100)}%`;

        $("gauge-label").textContent =
          level === 3 ? "3단계 · 가득!" : `${level}단계`;

        $("pour-gauge").setAttribute("aria-valuenow", String(level));

        refreshBottles();
        updateButtons();
      }

      positionDrag();
      drag.frameId = requestAnimationFrame(dragTick);
    }

    function endDrag(event) {
      if (!drag) return;
      if (event && event.pointerId !== drag.id) return;

      const finished = drag;
      drag = null;

      cancelAnimationFrame(finished.frameId);
      finished.picture.remove();
      finished.button.classList.remove("is-dragging");

      $("pour-gauge").hidden = true;

      if (finished.button.hasPointerCapture(finished.id)) {
        finished.button.releasePointerCapture(finished.id);
      }

      refreshBottles();
      updateButtons();
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) endDrag();
    });

    window.addEventListener("blur", () => endDrag());

    function openFilePicker() {
      if (busy) return;

      endDrag();

      // 같은 사진을 다시 선택해도 change 이벤트가 발생하게 합니다.
      $("image-input").value = "";
      $("image-input").click();
    }

    $("editor-reselect-button").addEventListener("click", openFilePicker);
    $("reselect-button").addEventListener("click", openFilePicker);

    $("image-input").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file || busy) return;

      const version = ++fileVersion;
      endDrag();
      busy = true;
      updateButtons();
      tell("사진을 불러오는 중…");

      try {
        const loaded = await editor.loadFile(file);
        if (!loaded || version !== fileVersion) return;

        clearGif();
        scene.resetIngredients();

        stage = "editor";

        $("upload-section").hidden = true;
        $("editor-section").hidden = false;
        $("toy-section").hidden = true;

        tell("사진을 그대로 쓰거나, 남길 부분을 칠해서 오려줘.");
      } catch (error) {
        tell(error.message || "사진을 읽지 못했어.");
      } finally {
        busy = false;
        updateButtons();
      }
    });

    $("put-image-button").addEventListener("click", () => {
      if (busy || stage !== "editor") return;

      try {
        const image = editor.exportImage();
        scene.setImage(image);

        stage = "selecting";

        $("editor-section").hidden = true;
        $("toy-section").hidden = false;

        clearGif();
        refreshBottles();
        updateButtons();
        tell("병을 잡고 솥 입구로 가져가 봐.");
      } catch (error) {
        tell(error.message);
      }
    });

    $("confirm-button").addEventListener("click", () => {
      if (busy || stage !== "selecting" || !scene.hasIngredients()) return;

      endDrag();

      stage = "confirmed";
      scene.state = "confirmed";

      updateButtons();
      tell("재료 선택 완료!");
    });

    async function mix() {
      if (busy || !["confirmed", "result"].includes(stage)) return;

      clearGif();
      endDrag();

      busy = true;
      stage = "mixing";

      updateButtons();
      tell("");

      try {
        const finished = await scene.startMix();

        if (finished) {
          stage = "result";
          tell("완성! 이미지나 GIF로 저장할 수 있어.");
        } else {
          stage = "confirmed";
        }
      } catch (error) {
        stage = "confirmed";
        scene.state = "confirmed";
        tell(error.message || "완성 이미지를 만들지 못했어.");
      } finally {
        busy = false;
        updateButtons();
      }
    }

    $("mix-button").addEventListener("click", mix);
    $("remix-button").addEventListener("click", mix);

    $("restart-button").addEventListener("click", () => {
      if (busy || !scene.image) return;

      endDrag();
      clearGif();
      scene.resetIngredients();

      stage = "selecting";

      refreshBottles();
      updateButtons();

      tell("같은 사진으로 재료를 다시 골라줘.");
    });

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      link.style.display = "none";

      document.body.append(link);
      link.click();
      link.remove();

      // 브라우저가 파일을 가져갈 시간을 준 뒤 URL을 해제합니다.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    $("save-png-button").addEventListener("click", async () => {
      if (busy || stage !== "result") return;

      busy = true;
      updateButtons();

      try {
        const result = scene.getResultCanvas();

        const blob = await new Promise((resolve, reject) => {
          result.toBlob((value) => {
            if (value) resolve(value);
            else reject(new Error("이미지를 저장하지 못했어."));
          }, "image/png");
        });

        downloadBlob(blob, "witch-cauldron.png");
        tell("투명 배경 PNG를 저장했어.");
      } catch (error) {
        tell(error.message || "이미지 저장 중 오류가 발생했어.");
      } finally {
        busy = false;
        updateButtons();
      }
    });

    $("save-gif-button").addEventListener("click", async () => {
      if (busy || stage !== "result") return;

      if (gifUrl) {
        $("gif-result").hidden = false;
        tell("이미 만든 GIF가 있어. 아래 GIF 저장 버튼을 눌러줘.");
        return;
      }

      busy = true;
      updateButtons();

      $("export-status").hidden = false;
      $("export-message").textContent = "GIF를 만들고 있어요. 0%";
      $("export-progress").value = 0;

      tell("완료될 때까지 이 페이지를 열어둬.");

      try {
        const blob = await exportWitchGif(scene, {
          onProgress(percent) {
            $("export-progress").value = percent;
            $("export-message").textContent =
              `GIF를 만들고 있어요. ${percent}%`;
          }
        });

        gifUrl = URL.createObjectURL(blob);

        $("gif-preview").src = gifUrl;
        $("gif-download").href = gifUrl;
        $("gif-result").hidden = false;

        const megabytes = blob.size / 1024 / 1024;

        $("export-message").textContent =
          `완성! 6초 · 480×480 · 약 ${megabytes.toFixed(1)}MB`;

        tell("미리보기를 확인하고 GIF 저장을 눌러줘.");
      } catch (error) {
        $("export-status").hidden = true;
        tell(error.message || "GIF를 만들지 못했어. 다시 시도해줘.");
      } finally {
        busy = false;
        updateButtons();
      }
    });

    window.addEventListener("pagehide", () => {
      endDrag();
    });

    createBottles();
    updateButtons();
    setPressed("use-original-button", true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
