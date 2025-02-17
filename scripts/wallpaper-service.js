const Service = require('node-windows').Service;
const path = require('path');
// Servis yapılandırması
const svc = new Service({
    name: 'WallpaperWatcher',
    description: 'Duvar kağıdı klasörlerini izleyen servis',
    script: path.join(__dirname, 'generateImageJson.js'),
    nodeOptions: ['--harmony'],
    wait: 2,
    grow: .5,
    maxRestarts: 3
});
// Servis olayları
svc.on('install', () => {
    console.log('Servis başarıyla yüklendi.');
    svc.start();
});
svc.on('uninstall', () => {
    console.log('Servis başarıyla kaldırıldı.');
});
svc.on('start', () => {
    console.log('Servis başlatıldı.');
});
svc.on('stop', () => {
    console.log('Servis durduruldu.');
});
svc.on('error', (err) => {
    console.error('Servis hatası:', err);
});
// Komut satırı argümanlarını kontrol et
const args = process.argv.slice(2);
if (args.includes('install')) {
    svc.install();
} else if (args.includes('uninstall')) {
    svc.uninstall();
} else {
    console.log('Kullanım: node wallpaper-service.js [install|uninstall]');
}
