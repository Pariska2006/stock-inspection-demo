/* Local QR scanner. No camera frames or decoded values are transmitted. */
window.StockQR = (() => {
  'use strict';

  let stream = null;
  let timer = null;
  let generation = 0;
  let label = null;
  let lastRejected = '';
  let lastRejectedAt = 0;

  const el = id => document.getElementById(id);
  const dialog = () => el('qrDialog');
  const status = value => { if (el('qrStatus')) el('qrStatus').textContent = value; };

  function stop() {
    generation++;
    clearTimeout(timer);
    timer = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    const video = el('qrVideo');
    if (video) { video.pause(); video.srcObject = null; }
  }

  function useLabel(found) {
    const input = el('insSerial');
    if (!input || input.readOnly || !found?.serial) {
      status('ไม่พบช่อง Serial ที่แก้ไขได้ กรุณาปิดหน้าต่างแล้วเปิดหน้าตรวจใหม่');
      return;
    }
    input.value = found.serial;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // Only fill Model if QR actually supplied one and this does not overwrite a typed value.
    if (found.model) {
      const model = el('insModel');
      if (model && !model.value.trim()) {
        model.value = found.model;
        model.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    stop();
    dialog().close();
    input.focus({ preventScroll: true });
    // The inspector must still verify the PIN against the physical label before saving.
    const note = document.createElement('p');
    note.className = 'hint qr-scan-confirmation';
    note.setAttribute('role', 'status');
    note.textContent = 'อ่าน Serial จาก QR แล้ว กรุณาเทียบเลขกับป้ายรถก่อนบันทึก';
    const previous = document.querySelector('.qr-scan-confirmation');
    if (previous) previous.remove();
    input.closest('.field')?.append(note);
  }

  async function camera() {
    const constraints = [
      {video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false},
      {video:true,audio:false}
    ];
    let lastError;
    for (const config of constraints) {
      try { return await navigator.mediaDevices.getUserMedia(config); }
      catch (error) {
        lastError = error;
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') break;
      }
    }
    throw lastError || Error('ไม่พบกล้อง');
  }

  async function start() {
    stop();
    const current = generation;
    label = null;
    lastRejected = '';
    el('qrUse').disabled = true;
    el('qrCandidate').value = '';
    el('qrFields').textContent = '';
    if (!dialog().open) dialog().showModal();
    status('กำลังเปิดกล้อง…');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง กรุณาพิมพ์ Serial เอง');
      return;
    }

    let video;
    try {
      const obtained = await camera();
      if (current !== generation || !dialog().open) {
        obtained.getTracks().forEach(track => track.stop());
        return;
      }
      stream = obtained;
      video = el('qrVideo');
      video.srcObject = stream;
      await video.play();
      if (current !== generation) return;

      let detector = null;
      try {
        if (window.BarcodeDetector && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
          detector = new BarcodeDetector({formats:['qr_code']});
        }
      } catch { /* Use jsQR instead */ }

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', {willReadFrequently:true});
      if (!context) throw Error('ไม่สามารถอ่านภาพกล้องในเบราว์เซอร์นี้ได้');
      if (!detector && typeof window.jsQR !== 'function') throw Error('ตัวอ่าน QR ยังโหลดไม่สำเร็จ กรุณารีเฟรชหน้า');

      const deadline = Date.now() + 60000;
      status('วาง QR ให้อยู่กลางภาพ · เมื่ออ่าน Serial ได้ ระบบจะกรอกให้อัตโนมัติ');
      async function scan() {
        if (current !== generation || !stream || !dialog().open) return;
        if (!stream.getVideoTracks().some(track => track.readyState === 'live')) {
          stop();
          status('กล้องหยุดทำงาน กรุณากดสแกนใหม่');
          return;
        }
        if (Date.now() > deadline) {
          stop();
          status('ยังอ่าน QR ไม่ได้ กรุณากดสแกนใหม่ หรือปิดแล้วพิมพ์ Serial เอง');
          return;
        }
        try {
          let raw = '';
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            if (detector) {
              raw = (await detector.detect(video))[0]?.rawValue || '';
            } else {
              const scale = Math.min(1, 720 / Math.max(video.videoWidth,video.videoHeight));
              canvas.width = Math.max(1,Math.round(video.videoWidth*scale));
              canvas.height = Math.max(1,Math.round(video.videoHeight*scale));
              context.drawImage(video,0,0,canvas.width,canvas.height);
              const frame = context.getImageData(0,0,canvas.width,canvas.height);
              raw = window.jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'})?.data || '';
            }
          }
          if (current !== generation) return;
          if (raw) {
            try {
              const parsed = StockDomain.parseLabel(raw);
              if (current !== generation) return;
              label = parsed;
              el('qrCandidate').value = parsed.serial;
              el('qrFields').textContent = parsed.identifierType==='unlabelled'
                ? 'QR เป็นรหัสเปล่า โปรดตรวจป้ายก่อนบันทึก'
                : parsed.fields.map(field => field.label+': '+field.value).join(' · ');
              el('qrUse').disabled = false;
              // Successful decoding fills the form immediately instead of leaving a black preview.
              useLabel(parsed);
              return;
            } catch (error) {
              // A readable QR is not necessarily a tractor PIN. Do not stop the camera.
              if (raw!==lastRejected || Date.now()-lastRejectedAt>5000) {
                lastRejected = raw;
                lastRejectedAt = Date.now();
                status('อ่าน QR ได้แต่ไม่พบ PIN / Serial ที่ใช้ได้: '+error.message+' · ขยับไปที่ QR บนป้ายรถ');
              }
            }
          }
        } catch(error) {
          if (current !== generation) return;
          // Camera may intermittently fail on a frame; retry rather than leaving a black preview.
          status('กำลังปรับภาพกล้อง ลองเลื่อน QR ให้อยู่กลางภาพ');
        }
        timer = setTimeout(scan,250);
      }
      scan();
    } catch(error) {
      if (current !== generation) return;
      stop();
      status(error?.name==='NotAllowedError'
        ? 'ยังไม่ได้อนุญาตใช้กล้อง กรุณาอนุญาตกล้องในเบราว์เซอร์'
        : 'เปิดกล้องไม่ได้: '+(error?.message||'กล้องไม่พร้อม')+' · สามารถปิดหน้าต่างแล้วพิมพ์ Serial ได้');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    dialog().addEventListener('close', stop);
    el('qrCancel').addEventListener('click', () => dialog().close());
    el('qrRetry').addEventListener('click', start);
    el('qrUse').addEventListener('click', () => { if(label) useLabel(label); });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      if (dialog()?.open) status('กล้องถูกหยุดเมื่อออกจากหน้า กดสแกนใหม่ได้');
    }
  });
  window.addEventListener('pagehide',stop);
  return {start,stop};
})();
