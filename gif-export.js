(() => {
  "use strict";

  /*
   * 별도 작업 스레드에서 실행됩니다.
   * 프레임은 한 장씩 받아 압축하므로,
   * 원본 프레임 전체를 동시에 보관하지 않습니다.
   */
  function gifWorker() {
    let width;
    let height;
    let palette;
    let lookup;
    let chunks = [];

    function word(value) {
      return [value & 255, (value >> 8) & 255];
    }

    /*
     * 사진과 파츠의 색을 분석하여
     * GIF에서 사용할 최대 256색을 만듭니다.
     */
    function makePalette(samples) {
      const histogram = new Map();

      for (let i = 0; i < samples.length; i += 16) {
        const r = samples[i] >> 3;
        const g = samples[i + 1] >> 3;
        const b = samples[i + 2] >> 3;
        const key = (r << 10) | (g << 5) | b;

        histogram.set(key, (histogram.get(key) || 0) + 1);
      }

      const colors = [];

      for (const [key, count] of histogram) {
        colors.push({
          r: ((key >> 10) & 31) * 8 + 4,
          g: ((key >> 5) & 31) * 8 + 4,
          b: (key & 31) * 8 + 4,
          count
        });
      }

      function describe(items) {
        const min = [255, 255, 255];
        const max = [0, 0, 0];
        let weight = 0;

        for (const item of items) {
          const values = [item.r, item.g, item.b];

          for (let channel = 0; channel < 3; channel++) {
            min[channel] = Math.min(min[channel], values[channel]);
            max[channel] = Math.max(max[channel], values[channel]);
          }

          weight += item.count;
        }

        const ranges = max.map((value, index) => value - min[index]);
        const range = Math.max(...ranges);

        return {
          items,
          weight,
          channel: ranges.indexOf(range),
          score: items.length > 1 ? range * Math.sqrt(weight) : -1
        };
      }

      const boxes = [describe(colors)];

      while (boxes.length < 256) {
        let best = -1;
        let bestScore = -1;

        for (let i = 0; i < boxes.length; i++) {
          if (boxes[i].score > bestScore) {
            bestScore = boxes[i].score;
            best = i;
          }
        }

        if (best < 0 || bestScore <= 0) break;

        const box = boxes.splice(best, 1)[0];
        const key = ["r", "g", "b"][box.channel];

        box.items.sort((a, b) => a[key] - b[key]);

        let accumulated = 0;
        let split = 1;

        for (let i = 0; i < box.items.length - 1; i++) {
          accumulated += box.items[i].count;
          split = i + 1;
          if (accumulated >= box.weight / 2) break;
        }

        boxes.push(
          describe(box.items.slice(0, split)),
          describe(box.items.slice(split))
        );
      }

      const result = new Uint8Array(768);

      boxes.forEach((box, index) => {
        let r = 0;
        let g = 0;
        let b = 0;

        for (const color of box.items) {
          r += color.r * color.count;
          g += color.g * color.count;
          b += color.b * color.count;
        }

        result[index * 3] = Math.round(r / box.weight);
        result[index * 3 + 1] = Math.round(g / box.weight);
        result[index * 3 + 2] = Math.round(b / box.weight);
      });

      // 色数が256未満の場合は最後の色で残りを埋めます。
      for (let i = boxes.length; i < 256; i++) {
        const previous = Math.max(0, boxes.length - 1) * 3;
        result.set(result.slice(previous, previous + 3), i * 3);
      }

      return result;
    }

    function quantize(rgba) {
      const indexed = new Uint8Array(width * height);

      for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel++) {
        const r = rgba[i] >> 3;
        const g = rgba[i + 1] >> 3;
        const b = rgba[i + 2] >> 3;

        const key = (r << 10) | (g << 5) | b;

        let chosen = lookup[key];

        if (chosen < 0) {
          let bestDistance = Infinity;
          chosen = 0;

          const red = r * 8 + 4;
          const green = g * 8 + 4;
          const blue = b * 8 + 4;

          for (let color = 0; color < 256; color++) {
            const offset = color * 3;
            const dr = red - palette[offset];
            const dg = green - palette[offset + 1];
            const db = blue - palette[offset + 2];

            const distance = dr * dr + dg * dg + db * db;

            if (distance < bestDistance) {
              bestDistance = distance;
              chosen = color;
            }
          }

          lookup[key] = chosen;
        }

        indexed[pixel] = chosen;
      }

      return indexed;
    }

    /*
     * GIF 표준의 LZW 압축.
     */
    function lzw(data) {
      let dictionary = new Map();
      let nextCode = 258;
      let bits = 9;

      const output = [];
      let buffer = 0;
      let bitCount = 0;

      function emit(code) {
        buffer |= code << bitCount;
        bitCount += bits;

        while (bitCount >= 8) {
          output.push(buffer & 255);
          buffer >>>= 8;
          bitCount -= 8;
        }
      }

      emit(256);

      let prefix = data[0];

      for (let i = 1; i < data.length; i++) {
        const value = data[i];
        const key = prefix * 256 + value;
        const existing = dictionary.get(key);

        if (existing !== undefined) {
          prefix = existing;
          continue;
        }

        emit(prefix);

        if (nextCode < 4096) {
          dictionary.set(key, nextCode++);

          if (nextCode > (1 << bits) && bits < 12) {
            bits++;
          }
        } else {
          emit(256);
          dictionary = new Map();
          nextCode = 258;
          bits = 9;
        }

        prefix = value;
      }

      emit(prefix);

      if (nextCode === (1 << bits) && bits < 12) {
        bits++;
      }

      emit(257);

      if (bitCount) output.push(buffer & 255);

      return new Uint8Array(output);
    }

    function initialize(message) {
      width = message.width;
      height = message.height;

      palette = makePalette(message.samples);
      lookup = new Int16Array(32768);
      lookup.fill(-1);

      const signature = [
        71, 73, 70, 56, 57, 97 // GIF89a
      ];

      chunks = [
        new Uint8Array([
          ...signature,
          ...word(width),
          ...word(height),
          247, 0, 0
        ]),
        palette,
        new Uint8Array([
          33, 255, 11,
          78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48,
          3, 1, 0, 0, 0
        ])
      ];

      self.postMessage({ type: "ready" });
    }

    function addFrame(message) {
      const compressed = lzw(quantize(message.rgba));

      chunks.push(new Uint8Array([
        // 그림 표시 시간과 프레임 처리 방식
        33, 249, 4, 4,
        ...word(message.delay),
        0, 0,

        // 프레임 크기
        44, 0, 0, 0, 0,
        ...word(width),
        ...word(height),
        0,

        // LZW 최소 코드 크기
        8
      ]));

      for (let offset = 0; offset < compressed.length; offset += 255) {
        const block = compressed.subarray(offset, offset + 255);

        chunks.push(new Uint8Array([block.length]));
        chunks.push(block);
      }

      chunks.push(new Uint8Array([0]));

      self.postMessage({ type: "frame-done" });
    }

    self.onmessage = (event) => {
      try {
        const message = event.data;

        if (message.type === "init") {
          initialize(message);
        } else if (message.type === "frame") {
          addFrame(message);
        } else if (message.type === "finish") {
          chunks.push(new Uint8Array([59]));

          const blob = new Blob(chunks, { type: "image/gif" });

          chunks = [];
          palette = null;
          lookup = null;

          self.postMessage({ type: "complete", blob });
        }
      } catch (error) {
        self.postMessage({
          type: "error",
          message: error.message || "GIF 생성 중 오류가 발생했어."
        });
      }
    };
  }

  /*
   * app.js에서 호출할 함수.
   *
   * exportWitchGif(scene, {
   *   onProgress: (percent) => { ... }
   * })
   *
   * 결과: GIF Blob
   */
  async function exportWitchGif(scene, options = {}) {
    if (!scene.result) {
      throw new Error("솥을 섞어서 이미지를 먼저 완성해줘.");
    }

    if (typeof Worker === "undefined") {
      throw new Error(
        "이 브라우저에서는 GIF 생성 기능을 사용할 수 없어."
      );
    }

    const width = 480;
    const height = 480;
    const fps = 24;
    const duration = 6;
    const totalFrames = fps * duration;

    const onProgress =
      typeof options.onProgress === "function"
        ? options.onProgress
        : () => {};

    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;

    const ctx = surface.getContext("2d", {
      willReadFrequently: true
    });

    const source = `(${gifWorker.toString()})();`;
    const workerUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" })
    );

    let worker;
    let pending = null;

    function fail(error) {
      if (!pending) return;

      const request = pending;
      pending = null;
      clearTimeout(request.timer);
      request.reject(error);
    }

    function request(message, transfers = []) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          fail(new Error(
            "GIF 작업이 오래 응답하지 않아 중단했어. 다시 시도해줘."
          ));
        }, 60000);

        pending = { resolve, reject, timer };

        try {
          worker.postMessage(message, transfers);
        } catch (error) {
          fail(error);
        }
      });
    }

    try {
      worker = new Worker(workerUrl);

      worker.onmessage = (event) => {
        if (!pending) return;

        if (event.data.type === "error") {
          fail(new Error(event.data.message));
          return;
        }

        const request = pending;
        pending = null;
        clearTimeout(request.timer);
        request.resolve(event.data);
      };

      worker.onerror = (event) => {
        event.preventDefault();
        fail(new Error(
          "GIF 작업을 실행하지 못했어. 페이지를 새로고침해줘."
        ));
      };

      worker.onmessageerror = () => {
        fail(new Error("GIF 작업 데이터를 읽지 못했어."));
      };

      await scene.waitForAssets();
      onProgress(0);

      /*
       * 섞는 장면과 완성 장면에서 색을 수집합니다.
       * 이를 바탕으로 GIF 전체의 색상표를 만듭니다.
       */
      const frameBytes = width * height * 4;
      const samples = new Uint8Array(frameBytes * 2);

      scene.renderFrame(ctx, 2, width, height);
      samples.set(
        ctx.getImageData(0, 0, width, height).data,
        0
      );

      scene.renderFrame(ctx, 5.5, width, height);
      samples.set(
        ctx.getImageData(0, 0, width, height).data,
        frameBytes
      );

      await request({
        type: "init",
        width,
        height,
        samples
      }, [samples.buffer]);

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;

        scene.renderFrame(ctx, time, width, height);

        const rgba = ctx.getImageData(
          0, 0, width, height
        ).data;

        /*
         * GIF 시간 단위는 0.01초입니다.
         * 4/5 단위를 섞어 전체 길이를 6초로 맞춥니다.
         */
        const delay =
          Math.round((frame + 1) * 100 / fps) -
          Math.round(frame * 100 / fps);

        await request({
          type: "frame",
          rgba,
          delay
        }, [rgba.buffer]);

        onProgress(
          Math.round((frame + 1) / totalFrames * 99)
        );

        // 진행 표시와 사용자 입력이 처리될 시간을 줍니다.
        if (frame % 8 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const response = await request({ type: "finish" });

      onProgress(100);
      return response.blob;
    } finally {
      if (pending) clearTimeout(pending.timer);
      pending = null;

      if (worker) worker.terminate();

      URL.revokeObjectURL(workerUrl);
      surface.width = 0;
      surface.height = 0;
    }
  }

  window.exportWitchGif = exportWitchGif;
})();
