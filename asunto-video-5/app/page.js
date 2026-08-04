"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./page.module.css";

const MOTIONS = [
  { value: "push-in", label: "Sisäänvienti" },
  { value: "pan", label: "Panorointi" },
  { value: "orbit", label: "Pyöritys" },
  { value: "room-tour", label: "Huonekierros" },
];

let uid = 0;
function nextId() {
  uid += 1;
  return `plate-${uid}`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [plates, setPlates] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [mergeState, setMergeState] = useState("idle"); // idle | merging | done | error
  const [mergedVideoUrl, setMergedVideoUrl] = useState(null);
  const inputRef = useRef(null);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const newPlates = await Promise.all(
      files.map(async (file, i) => ({
        id: nextId(),
        file,
        preview: await readFileAsDataURL(file),
        label: `HUONE ${String(plates.length + i + 1).padStart(2, "0")}`,
        motion: "push-in",
        status: "idle", // idle | queued | scanning | done | error
        videoUrl: null,
      }))
    );
    setPlates((prev) => [...prev, ...newPlates]);
  }, [plates.length]);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const updatePlate = (id, patch) => {
    setPlates((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePlate = (id) => {
    setPlates((prev) => prev.filter((p) => p.id !== id));
  };

  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const reorderPlates = (fromIndex, toIndex) => {
    setPlates((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // Yleinen jonon tilan kysely: palauttaa valmiin videon URL:n, tai null jos
  // epäonnistui / aikakatkaistiin. Käytetään sekä yksittäisille klipeille
  // että myöhemmälle yhdistämiselle, koska molemmat käyttävät samaa fal.ai
  // jonoprotokollaa, vain eri mallilla.
  const pollForResult = async (requestId, model) => {
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const res = await fetch(
          `/api/status?requestId=${encodeURIComponent(requestId)}&model=${encodeURIComponent(model)}`
        );
        const data = await res.json();
        if (data.status === "COMPLETED") {
          return { videoUrl: data.videoUrl || null, error: null };
        }
        if (data.status === "ERROR" || data.status === "FAILED") {
          return { videoUrl: null, error: data.error || "Generointi epäonnistui." };
        }
      } catch (err) {
        // ohitetaan ohimenevät verkkovirheet, jatketaan kyselyä
      }
    }
    return { videoUrl: null, error: "Aikakatkaisu — generointi kesti liian kauan." };
  };

  const [mergeError, setMergeError] = useState(null);

  const mergeClips = async (orderedVideoUrls) => {
    setMergeState("merging");
    setMergeError(null);
    try {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls: orderedVideoUrls }),
      });
      const data = await res.json();
      if (!res.ok || !data.requestId) {
        setMergeState("error");
        setMergeError(data.error || "Yhdistämiskutsu epäonnistui.");
        return;
      }
      const { videoUrl, error } = await pollForResult(data.requestId, data.model);
      if (!videoUrl) {
        setMergeState("error");
        setMergeError(error);
        return;
      }
      setMergedVideoUrl(videoUrl);
      setMergeState("done");
    } catch (err) {
      setMergeState("error");
      setMergeError(String(err));
    }
  };

  const generateAll = async () => {
    if (plates.length === 0) return;
    setIsRunning(true);
    setMergeState("idle");
    setMergedVideoUrl(null);

    await Promise.all(
      plates.map(async (plate) => {
        updatePlate(plate.id, { status: "scanning", errorMessage: null });
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: plate.preview, motion: plate.motion }),
          });
          const data = await res.json();
          if (!res.ok || !data.requestId) {
            updatePlate(plate.id, {
              status: "error",
              errorMessage: data.error || "Kutsu epäonnistui.",
            });
            return;
          }
          const { videoUrl, error } = await pollForResult(data.requestId, data.model);
          if (!videoUrl) {
            updatePlate(plate.id, { status: "error", errorMessage: error });
            return;
          }
          updatePlate(plate.id, { status: "done", videoUrl });
        } catch (err) {
          updatePlate(plate.id, { status: "error", errorMessage: String(err) });
        }
      })
    );

    setIsRunning(false);

    // Kun kaikki klipit onnistuivat ja niitä on vähintään kaksi, yhdistetään
    // ne automaattisesti yhdeksi walkthrough-videoksi. plates-tila ei ole
    // vielä päivittynyt Promise.all:in jälkeen suoraan, joten luetaan
    // tuoreimmat arvot funktionaalisella setPlates-kutsulla.
    setPlates((current) => {
      const urls = current.map((p) => p.videoUrl).filter(Boolean);
      if (urls.length >= 2 && urls.length === current.length) {
        mergeClips(urls);
      }
      return current;
    });
  };

  const doneCount = plates.filter((p) => p.status === "done").length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>PLANSI — 001 / KUVA&nbsp;→&nbsp;VIDEO</div>
        <h1 className={styles.title}>Piirrä liike takaisin still-kuviin.</h1>
        <p className={styles.sub}>
          Lataa asunnon huonekuvat. Jokainen kuva skannataan syvyyskartaksi ja
          muunnetaan lyhyeksi walkthrough-klipiksi, jotka yhdistetään lopuksi
          automaattisesti yhdeksi kokonaiseksi videoksi.
        </p>
      </header>

      <section
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className={styles.dropzoneMark}>+</div>
        <div className={styles.dropzoneText}>
          Pudota kuvat tähän, tai klikkaa valitaksesi
        </div>
        <div className={styles.dropzoneHint}>JPG / PNG · yksi kuva per huone</div>
      </section>

      {plates.length > 0 && (
        <>
          <div className={styles.reorderHint}>Raahaa ⠿-kahvasta järjestääksesi huoneet uudelleen</div>
          <section className={styles.plates}>
          {plates.map((plate, index) => (
            <div
              key={plate.id}
              className={`${styles.plate} ${overIndex === index ? styles.plateDragOver : ""}`}
              onDragOver={(e) => {
                if (isRunning) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (isRunning || dragIndex === null) return;
                reorderPlates(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <div
                className={styles.plateHandle}
                draggable={!isRunning}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                title="Raahaa vaihtaaksesi järjestystä"
              >
                ⠿
              </div>

              <div className={styles.plateImageWrap}>
                <img src={plate.preview} alt="" className={styles.plateImage} />
                {plate.status === "scanning" && <div className={styles.scanLine} />}
                {plate.status === "done" && (
                  <div className={styles.doneBadge}>VALMIS</div>
                )}
                {plate.status === "error" && (
                  <div className={styles.errorBadge}>VIRHE</div>
                )}
              </div>

              {plate.status === "error" && plate.errorMessage && (
                <div className={styles.plateErrorText}>{plate.errorMessage}</div>
              )}

              <div className={styles.plateMeta}>
                <input
                  className={styles.plateLabel}
                  value={plate.label}
                  onChange={(e) => updatePlate(plate.id, { label: e.target.value })}
                  aria-label="Huoneen nimi"
                />
                <select
                  className={styles.plateSelect}
                  value={plate.motion}
                  onChange={(e) => updatePlate(plate.id, { motion: e.target.value })}
                  disabled={plate.status === "scanning" || plate.status === "done"}
                >
                  {MOTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                {plate.status === "done" && plate.videoUrl && (
                  <a
                    href={plate.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.plateVideoLink}
                  >
                    Katso video ↗
                  </a>
                )}

                <button
                  type="button"
                  className={styles.plateRemove}
                  onClick={() => removePlate(plate.id)}
                  disabled={isRunning}
                >
                  Poista
                </button>
              </div>

              <div className={styles.plateIndex}>
                {String(index + 1).padStart(2, "0")}
              </div>
            </div>
          ))}
        </section>
        </>
      )}

      {plates.length > 0 && (
        <div className={styles.actionBar}>
          <div className={styles.actionStatus}>
            {doneCount} / {plates.length} klippiä valmis
          </div>
          <button
            type="button"
            className={styles.generateButton}
            onClick={generateAll}
            disabled={isRunning}
          >
            {isRunning ? "Skannataan…" : "Luo videot"}
          </button>
        </div>
      )}

      {mergeState === "merging" && (
        <div className={styles.mergeBox}>Yhdistetään klippejä yhdeksi videoksi…</div>
      )}

      {mergeState === "error" && (
        <div className={`${styles.mergeBox} ${styles.mergeBoxError}`}>
          Klippien yhdistäminen epäonnistui{mergeError ? `: ${mergeError}` : "."} Yksittäiset
          klipit ovat silti käytettävissä yllä olevista linkeistä.
        </div>
      )}

      {mergeState === "done" && mergedVideoUrl && (
        <div className={styles.mergeBox}>
          <div className={styles.mergeLabel}>KOKO WALKTHROUGH-VIDEO</div>
          <video
            src={mergedVideoUrl}
            controls
            className={styles.mergeVideo}
          />
          <a
            href={mergedVideoUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.mergeDownload}
          >
            Avaa / lataa video ↗
          </a>
        </div>
      )}
    </main>
  );
}
