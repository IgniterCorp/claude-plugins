"""화자 분리 — STT 구간마다 화자 임베딩(wespeaker VoxCeleb, sherpa-onnx)을 뽑아 k 개로 묶는다. 무료·오프라인.
python diarize.py <stt.json> <16k mono wav> <out.json> <models dir> [화자 수, 기본 2]
out: [{"start": 초, "end": 초, "speaker": 0}, ...] — 먼저 말한 사람이 0(A)

🔴 sherpa-onnx 의 pyannote 분할 + 클러스터링은 쓰지 않는다. 2인 남성 인터뷰(70분, 2026-10-20)에서
   자동은 11명, k=2 는 한 사람 67.5분 · 다른 사람 0.2분으로 무너졌다(10분+). 구간 단위 임베딩 + k-means 는
   기준 줄 9/9 맞았고 26초다. 대신 한 STT 구간 안에서 화자가 바뀌면 못 가른다 — 구간이 짧아서 드물다.
"""
import json, os, sys
import numpy as np, sherpa_onnx, soundfile as sf

stt, wav, out, models = sys.argv[1:5]
k = int(sys.argv[5]) if len(sys.argv) > 5 and int(sys.argv[5]) > 0 else 2
segs = json.load(open(stt))["segments"]
audio, sr = sf.read(wav, dtype="float32")
dur = len(audio) / sr
ex = sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(
    model=f"{models}/wespeaker_en_voxceleb_resnet34.onnx", num_threads=os.cpu_count() or 4))

spans, E = [], []
for i, s in enumerate(segs):
    a = s["start"]
    b = min(segs[i + 1]["start"] if i + 1 < len(segs) else dur, a + 15)
    if b - a < 1.0:  # 1초 미만은 임베딩이 흔들린다 — 화자 없음(앞 사람 그대로)으로 둔다
        continue
    st = ex.create_stream()
    st.accept_waveform(sr, audio[int(a * sr):int(b * sr)])
    st.input_finished()
    e = np.asarray(ex.compute(st), dtype=np.float64)
    spans.append((a, b)); E.append(e / np.linalg.norm(e))
X = np.array(E)
assert np.isfinite(X).all()
# numpy 2.2 + macOS Accelerate 는 정상 값에도 matmul 경고를 낸다 (무작위 입력도 같다) — 값은 위에서 확인했다
np.seterr(all="ignore")

# 구면 k-means, 시작점 20번 중 가장 잘 묶인 것
rng, best = np.random.default_rng(0), None
for _ in range(20):
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(50):
        L = np.argmax(X @ C.T, 1)
        C = np.array([X[L == j].mean(0) if (L == j).any() else C[j] for j in range(k)])
        C /= np.linalg.norm(C, axis=1, keepdims=True)
    score = (X @ C.T).max(1).sum()
    if best is None or score > best[0]:
        best = (score, L.copy())
L = best[1]
order = {old: new for new, old in enumerate(dict.fromkeys(L.tolist()))}  # 먼저 말한 사람이 A
res = [{"start": round(a, 2), "end": round(b, 2), "speaker": order[int(l)]} for (a, b), l in zip(spans, L)]
json.dump(res, open(out, "w"))
mins = [round(sum(r["end"] - r["start"] for r in res if r["speaker"] == j) / 60, 1) for j in range(k)]
print(f"{len(res)}구간 · 화자 {k}명 · 분 {mins}")
