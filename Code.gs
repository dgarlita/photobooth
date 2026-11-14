/**
 * Backend Wedding Photobooth — Dinda & Wildan
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me   |   Who has access: Anyone
 * Salin URL berakhiran /exec ke CONFIG.API_URL di script.js.
 * Setiap kali kode diubah, buat deployment versi baru.
 */
const ROOT_FOLDER = 'Wedding Photobooth Dinda & Wildan';
const PHOTO_FOLDER = 'Photos';
const MAX_BYTES = 6 * 1024 * 1024; // batas ukuran foto setelah decode
const MAX_LIMIT = 60;

function getFolder_() {
  let root = firstFolder_(DriveApp.getFoldersByName(ROOT_FOLDER)) || DriveApp.createFolder(ROOT_FOLDER);
  let photos = firstFolder_(root.getFoldersByName(PHOTO_FOLDER)) || root.createFolder(PHOTO_FOLDER);
  return photos;
}
function firstFolder_(it) { return it.hasNext() ? it.next() : null; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (body.action !== 'upload') return json_({ success: false, message: 'Aksi tidak dikenal' });

    const raw = String(body.image || '');
    const base64 = raw.replace(/^data:image\/jpe?g;base64,/i, '');
    if (!base64 || base64.length > MAX_BYTES * 1.4) return json_({ success: false, message: 'Data foto tidak valid atau terlalu besar' });

    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > MAX_BYTES) return json_({ success: false, message: 'Ukuran foto melebihi batas' });
    // Validasi tanda tangan JPEG (FF D8 FF)
    if (!(bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1)) return json_({ success: false, message: 'File harus berformat JPEG' });

    const safe = String(body.filename || 'photo.jpg').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/\.jpe?g$/i, '');
    const name = safe.slice(0, 60) + '_' + Utilities.getUuid().slice(0, 6) + '.jpg';
    const blob = Utilities.newBlob(bytes, 'image/jpeg', name);
    const file = getFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return json_({ success: true, message: 'Photo uploaded successfully' });
  } catch (err) {
    return json_({ success: false, message: 'Server error: ' + err.message });
  }
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action !== 'gallery') return json_({ success: false, message: 'Aksi tidak dikenal' });

    const offset = Math.max(0, parseInt(p.offset, 10) || 0);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(p.limit, 10) || 24));

    const items = [];
    const it = getFolder_().getFilesByType(MimeType.JPEG);
    while (it.hasNext()) {
      const f = it.next();
      items.push({ id: f.getId(), name: f.getName(), time: f.getDateCreated().getTime() });
    }
    items.sort(function (a, b) { return b.time - a.time; }); // terbaru dulu

    const page = items.slice(offset, offset + limit).map(function (x) {
      return {
        name: x.name,
        url: 'https://drive.google.com/thumbnail?id=' + x.id + '&sz=w800',
        full: 'https://drive.google.com/thumbnail?id=' + x.id + '&sz=w2000',
        download: 'https://drive.google.com/uc?export=download&id=' + x.id,
        timestamp: new Date(x.time).toISOString()
      };
    });
    return json_({ success: true, photos: page, total: items.length, hasMore: offset + limit < items.length });
  } catch (err) {
    return json_({ success: false, message: 'Server error: ' + err.message });
  }
}
