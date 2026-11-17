/* Camera frames are decoded locally and never uploaded or saved as evidence. */
window.StockQR = (() => {
  'use strict';
  let label, stream, timer, generation = 0, deadline = 0;
  const dialog = () => document.getElementById('qrDialog');
  const status = value => { document.getElementById('qrStatus').textContent = value; };
  function stop() {
    generation++;
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    const video = document.getElementById('qrVideo');
    if (video) video.srcObject = null;
  }
  async function start() {
    stop();
    const current = generation;
    document.getElementById('qrUse').disabled = true;
    document.getElementById('qrCandidate').value = ''; label=null; document.getElementById('qrFields').textContent='';
    if (!dialog().open) dialog().showModal();
    status('กำลังขอใช้กล้อง…');
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return status('กล้องต้องใช้ HTTPS หรือ localhost · ปิดหน้าต่างแล้วพิมพ์ Serial ได้');
    try {
      const candidate = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
      if (current !== generation || !dialog().open) { candidate.getTracks().forEach(t => t.stop()); return; }
      stream = candidate;
      const video = document.getElementById('qrVideo');
      video.srcObject = stream;
      await video.play();
      if (current !== generation) return;
      let detector;
      if (window.BarcodeDetector && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats:['qr_code'] });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently:true });
      deadline = Date.now() + 45000;
      status('จัด QR ให้อยู่ในกรอบ · ระบบจะให้ยืนยัน Serial ก่อนใช้');
      async function scan() {
        if (current !== generation || !stream) return;
        if (Date.now() > deadline) { stop(); status('ยังอ่าน QR ไม่ได้ ลองสแกนใหม่หรือพิมพ์ Serial เอง'); return; }
        try {
          let raw;
          if (video.readyState >= 2) {
            if (detector) raw = (await detector.detect(video))[0]?.rawValue;
            else {
              const scale = Math.min(1, 720 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const frame = context.getImageData(0, 0, canvas.width, canvas.height);
              raw = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts:'attemptBoth' })?.data;
            }
          }
          if (current !== generation) return;
          if (raw) {
            stop();
            try {
              label = StockDomain.parseLabel(raw);
              document.getElementById('qrCandidate').value = label.serial;
              document.getElementById('qrFields').textContent = label.identifierType==='unlabelled'?'รหัสไม่ระบุชนิด · กรุณาเทียบกับ PIN บนป้าย':label.fields.map(f=>f.label+': '+f.value).join(' · ');
              document.getElementById('qrUse').disabled = false;
              status('ตรวจสอบ Serial ด้านล่าง แล้วกดใช้ Serial นี้ · ยังไม่ได้บันทึกผลตรวจ');
            } catch (error) { status(error.message); }
            return;
          }
        } catch { stop(); status('อ่านภาพจากกล้องไม่ได้ ลองใหม่หรือพิมพ์ Serial เอง'); return; }
        timer = setTimeout(scan, 180);
      }
      scan();
    } catch (error) {
      if (current !== generation) return;
      stop();
      status(error.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์หรือพิมพ์ Serial เอง' : 'กล้องไม่พร้อมใช้งาน ปิดแอปที่ใช้กล้องแล้วลองอีกครั้ง');
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    dialog().addEventListener('close', stop);
    document.getElementById('qrCancel').addEventListener('click', () => dialog().close());
    document.getElementById('qrRetry').addEventListener('click', start);
    document.getElementById('qrUse').addEventListener('click', () => {
      const input = document.getElementById('insSerial');
      if (input && !input.readOnly) {
        input.value = document.getElementById('qrCandidate').value;
        if(label?.model){const model=document.getElementById('insModel'); if(model){model.value=label.model;model.dispatchEvent(new Event('input',{bubbles:true}));}}
        input.dispatchEvent(new Event('input', { bubbles:true }));
        dialog().close(); input.focus();
      }
    });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); if (dialog()?.open) status('หยุดกล้องเมื่อออกจากหน้า กดสแกนใหม่เพื่อดำเนินการต่อ'); } });
  window.addEventListener('pagehide', stop);
  return { start, stop };
})();
