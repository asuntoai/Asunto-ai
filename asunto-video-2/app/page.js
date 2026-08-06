'use client';

import { useEffect, useState } from 'react';

const APP_VERSION = '2026-08-06-image-to-video-v4';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState([]);

  function addFiles(list) {
    const images = Array.from(list || [])
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setFiles((current) => [...current, ...images].slice(0, 20));
    setMessage('');
  }

  function removeFile(index) {
    setFiles((current) => {
      const item = current[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((_, i) => i !== index);
    });
  }

  function clearFiles() {
    files.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
    setFiles([]);
    setJobs([]);
    setMessage('');
  }

  async function generate() {
    if (!files.length || busy) return;

    setBusy(true);
    setJobs([]);
    setMessage(`Käynnistetään ${files.length} videota…`);

    // IMPORTANT: Send every image in its own HTTP request. Vercel serverless
    // functions have a request-body limit, so sending 5–20 images in one
    // multipart request can fail before /api/generate is even reached.
    // Each request is independent, while fal.ai jobs still run in parallel.
    const results = await Promise.all(
      files.map(async ({ file }, index) => {
        try {
          const payload = new FormData();
          payload.append('images', file, file.name);

          const response = await fetch('/api/generate', {
            method: 'POST',
            body: payload,
            cache: 'no-store',
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || `Kuvan ${index + 1} käsittely epäonnistui.`);
          }

          return { ok: true, jobs: data.jobs || [] };
        } catch (error) {
          return {
            ok: false,
            error: error?.message || `Kuvan ${index + 1} käsittely epäonnistui.`,
          };
        }
      })
    );

    const successfulJobs = results.flatMap((result) => result.jobs || []);
    const failures = results.filter((result) => !result.ok);

    setJobs(successfulJobs.map((job) => ({
      ...job,
      status: 'IN_QUEUE',
      videoUrl: null,
    })));

    if (failures.length === 0) {
      setMessage(`${successfulJobs.length} videota käynnistetty. Generointi voi kestää hetken.`);
    } else if (successfulJobs.length > 0) {
      setMessage(`${successfulJobs.length} videota käynnistetty, ${failures.length} epäonnistui. Yritä epäonnistuneita kuvia uudelleen.`);
    } else {
      setMessage(failures[0]?.error || 'Videoiden käynnistys epäonnistui.');
    }

    setBusy(false);
  }

  useEffect(() => {
    if (!jobs.length || !jobs.some((job) => !['COMPLETED', 'FAILED', 'ERROR'].includes(job.status))) return;

    const timer = setInterval(async () => {
      const pendingJobs = jobs.filter((job) => !['COMPLETED', 'FAILED', 'ERROR'].includes(job.status));
      await Promise.all(pendingJobs.map(async (job) => {
        try {
          const response = await fetch(`/api/status?requestId=${encodeURIComponent(job.requestId)}`, { cache: 'no-store' });
          const data = await response.json();
          setJobs((current) => current.map((item) => item.requestId === job.requestId
            ? { ...item, status: data.status || 'ERROR', videoUrl: data.videoUrl || item.videoUrl, error: data.error || null }
            : item));
        } catch (error) {
          setJobs((current) => current.map((item) => item.requestId === job.requestId
            ? { ...item, status: 'ERROR', error: error.message }
            : item));
        }
      }));
    }, 5000);

    return () => clearInterval(timer);
  }, [jobs]);

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">ASUNTO AI · IMAGE TO VIDEO · V4</div>
        <h1>Muuta asuntokuvat<br /><span>eläväksi videoksi.</span></h1>
        <p>Pudota huonekuvat tähän. AI luo niistä luonnollisen kameraliikkeen sisältäviä videoklippejä.</p>
      </section>

      <section className="card">
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
        >
          <div className="uploadIcon">↑</div>
          <h2>Pudota kuvat tähän</h2>
          <p>PNG, JPG tai WEBP · enintään 20 kuvaa · 8 MB / kuva</p>
          <label className="button secondary">
            Valitse kuvat
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => addFiles(event.target.files)} />
          </label>
        </div>

        {files.length > 0 && (
          <div className="files">
            <div className="filesHeader"><strong>{files.length} kuvaa</strong><button onClick={clearFiles}>Tyhjennä</button></div>
            <div className="grid">
              {files.map(({ file, preview }, index) => (
                <div className="thumb" key={`${file.name}-${index}`}>
                  <img src={preview} alt={file.name} />
                  <button aria-label="Poista kuva" onClick={() => removeFile(index)}>×</button>
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
            <button className="button primary" disabled={busy} onClick={generate}>
              {busy ? 'Käynnistetään…' : 'Luo videot →'}
            </button>
          </div>
        )}

        {message && <p className="message">{message}</p>}

        {jobs.length > 0 && (
          <section className="results">
            <h2>Videot</h2>
            <div className="resultsGrid">
              {jobs.map((job) => (
                <article className="result" key={job.requestId}>
                  <div className="resultTop">
                    <strong>{job.name}</strong>
                    <span className={job.status === 'COMPLETED' ? 'done' : ''}>{job.status === 'IN_QUEUE' ? 'Jonossa' : job.status === 'IN_PROGRESS' ? 'Generoi…' : job.status === 'COMPLETED' ? 'Valmis' : job.status}</span>
                  </div>
                  {job.videoUrl ? <video src={job.videoUrl} controls playsInline /> : <div className="videoPlaceholder">{job.error || 'AI tekee videota…'}</div>}
                  {job.videoUrl && <a className="download" href={job.videoUrl} target="_blank" rel="noreferrer">Avaa video ↗</a>}
                </article>
              ))}
            </div>
          </section>
        )}
      </section>

      <p className="footer">Asunto AI · AI-powered real estate walkthroughs · {APP_VERSION}</p>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #090a0c; color: #f4f4f0; font-family: Arial, Helvetica, sans-serif; }
        button, input { font: inherit; }
        .page { min-height: 100vh; padding: 72px 20px 40px; background: radial-gradient(circle at 50% 0%, #1b1d20 0, #090a0c 45%); }
        .hero { max-width: 850px; margin: 0 auto 42px; text-align: center; }
        .badge { display: inline-block; border: 1px solid #303238; border-radius: 999px; padding: 8px 13px; color: #a8abb0; font-size: 11px; letter-spacing: .14em; }
        h1 { font-size: clamp(46px, 8vw, 82px); line-height: .96; letter-spacing: -.055em; margin: 22px 0; }
        h1 span { color: #a9ff67; }
        .hero p { max-width: 590px; margin: auto; color: #9a9da3; font-size: 17px; line-height: 1.6; }
        .card { max-width: 900px; margin: auto; background: #111216; border: 1px solid #292b30; border-radius: 24px; padding: 14px; box-shadow: 0 30px 100px rgba(0,0,0,.35); }
        .dropzone { min-height: 360px; border: 1px dashed #45484f; border-radius: 17px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 35px; text-align: center; transition: .2s; }
        .dropzone.dragging { border-color: #a9ff67; background: rgba(169,255,103,.05); transform: scale(.995); }
        .uploadIcon { width: 58px; height: 58px; border: 1px solid #373a40; border-radius: 50%; display: grid; place-items: center; font-size: 28px; color: #a9ff67; margin-bottom: 18px; }
        h2 { margin: 0 0 14px; font-size: 25px; }
        .dropzone p { color: #777b82; margin: 0 0 22px; }
        .button { border: 0; border-radius: 11px; padding: 14px 22px; cursor: pointer; font-weight: 700; transition: .2s; }
        .button.primary { width: 100%; margin-top: 20px; background: #a9ff67; color: #080a08; }
        .button.primary:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .button.primary:disabled { opacity: .55; cursor: wait; }
        .button.secondary { background: #24262b; color: #fff; }
        .files { padding: 18px 6px 6px; }
        .filesHeader { display:flex; justify-content:space-between; margin-bottom: 14px; color:#d7d8da; }
        .filesHeader button { border:0; background:none; color:#888b91; cursor:pointer; }
        .grid,.resultsGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
        .thumb { position:relative; aspect-ratio: 4/3; overflow:hidden; border-radius:11px; background:#202126; }
        .thumb img { width:100%; height:100%; object-fit:cover; }
        .thumb button { position:absolute; right:6px; top:6px; width:25px; height:25px; border:0; border-radius:50%; background:rgba(0,0,0,.7); color:#fff; cursor:pointer; }
        .thumb span { position:absolute; left:7px; bottom:7px; background:rgba(0,0,0,.65); border-radius:5px; padding:3px 6px; font-size:11px; }
        .message { text-align:center; color:#a9ff67; font-size:14px; }
        .results { border-top:1px solid #292b30; margin-top:25px; padding:25px 6px 6px; }
        .resultsGrid { grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
        .result { background:#0c0d10; border:1px solid #292b30; border-radius:14px; padding:10px; overflow:hidden; }
        .resultTop { display:flex; justify-content:space-between; gap:10px; margin-bottom:10px; font-size:12px; color:#a2a5aa; }
        .resultTop strong { color:#e5e6e8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .done { color:#a9ff67; }
        .result video,.videoPlaceholder { width:100%; aspect-ratio:16/9; border-radius:9px; object-fit:cover; background:#17191d; }
        .videoPlaceholder { display:grid; place-items:center; color:#777b82; font-size:13px; text-align:center; padding:12px; }
        .download { display:block; color:#a9ff67; text-decoration:none; font-size:12px; margin:10px 2px 2px; }
        .footer { text-align:center; color:#55585e; font-size:12px; margin-top:25px; }
        @media(max-width:600px){ .page{padding-top:40px}.dropzone{min-height:300px;padding:20px} }
      `}</style>
    </main>
  );
}
