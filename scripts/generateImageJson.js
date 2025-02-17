const fs = require('fs').promises;
const fsWatch = require('fs').watch;
const path = require('path');
// Ana dizinin yolunu belirle (iki üst klasör)
const ROOT_DIR = path.join(__dirname, '..');
// Yol sabitlerini güncelle
const RESOURCE_PATHS = {
    VERTICAL: path.join(ROOT_DIR, 'resources', 'wallpapers', 'vertical', 'all'),
    HORIZONTAL: path.join(ROOT_DIR, 'resources', 'wallpapers', 'horizontal', 'all'),
    SQUARE: path.join(ROOT_DIR, 'resources', 'wallpapers', 'square', 'all')
};
// Klasör izleme durumunu tutan değişken
let isWatching = false;
// Ana fonksiyonu güncelle
async function generateImageJson() {
    const directories = Object.values(RESOURCE_PATHS);
    try {
        // Ana resources/wallpapers klasörünü oluştur
        for (const dir of directories) {
            // Dizin ve preview klasörü oluştur
            await fs.mkdir(dir, { recursive: true });
            await fs.mkdir(path.join(dir, 'preview'), { recursive: true });
            console.log(`📁 Klasör oluşturuldu/kontrol edildi: ${dir}`);
            try {
                // Resimleri tara
                const files = await fs.readdir(dir);
                const images = files.filter(file => file.endsWith('.jpg'));
                // JSON içeriğini oluştur
                const imageList = images.map(image => ({
                    original: image,
                    preview: `preview/${image.replace('.jpg', '.webp')}`
                }));
                const jsonContent = {
                    count: images.length,
                    lastUpdated: new Date().toISOString(),
                    images: imageList
                };
                // JSON dosyasını kaydet
                await fs.writeFile(
                    path.join(dir, 'images.json'),
                    JSON.stringify(jsonContent, null, 2)
                );
                console.log(`✅ ${path.basename(dir)}: ${images.length} resim işlendi`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`⚠️ ${path.basename(dir)} klasöründe resim bulunamadı`);
                    // Boş bir JSON dosyası oluştur
                    await fs.writeFile(
                        path.join(dir, 'images.json'),
                        JSON.stringify({ count: 0, lastUpdated: new Date().toISOString(), images: [] }, null, 2)
                    );
                } else {
                    throw error;
                }
            }
        }
        console.log('✨ Tüm JSON dosyaları başarıyla oluşturuldu!');
    } catch (error) {
        console.error('❌ Hata:', error.message);
    }
}
// Tek klasör için JSON güncelleme
async function updateFolderJson(folderPath, folderName) {
    console.log(`📁 İşleniyor: ${folderName}`);
    try {
        const files = await fs.readdir(folderPath);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });
        const imageList = imageFiles.filter(file => file.endsWith('.jpg')).map(image => ({
            original: image,
            preview: `preview/${image.replace('.jpg', '.webp')}`
        }));
        const jsonContent = {
            folder: folderName,
            count: imageFiles.length,
            lastUpdated: new Date().toISOString(),
            images: imageList
        };
        await fs.writeFile(
            path.join(folderPath, 'images.json'),
            JSON.stringify(jsonContent, null, 2)
        );
        console.log(`✅ ${folderName}: ${imageFiles.length} resim işlendi`);
    } catch (error) {
        console.error(`❌ ${folderName} klasöründe hata:`, error);
    }
}
// Klasör izleme fonksiyonu
function watchFolders() {
    if (isWatching) return;
    const resourcesPath = path.join(__dirname, '..', 'resources', 'wallpapers');
    try {
        // Ana klasörü izle
        fsWatch(resourcesPath, { recursive: true }, async (eventType, filename) => {
            if (!filename) return;
            const ext = path.extname(filename).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
            const isJson = ext === '.json';
            // JSON dosyalarını ve geçici dosyaları yoksay
            if (isJson || filename.startsWith('.')) return;
            // Değişikliğin olduğu klasörü bul
            const folderName = filename.split(path.sep)[0];
            const folderPath = path.join(resourcesPath, folderName);
            if (isImage) {
                console.log(`🔄 Değişiklik algılandı: ${folderName}/${filename}`);
                // Dosya sistemi işlemlerinin tamamlanması için kısa bir bekleme
                setTimeout(async () => {
                    await updateFolderJson(folderPath, folderName);
                }, 100);
            }
        });
        isWatching = true;
        console.log('👀 Klasörler izleniyor. Değişiklikler otomatik güncellenecek...');
        console.log('❔ İzlemeyi durdurmak için Ctrl+C tuşlarına basın.');
    } catch (error) {
        console.error('❌ İzleme başlatılamadı:', error);
    }
}
// Scripti çalıştır
async function init() {
    // İlk JSON dosyalarını oluştur
    await generateImageJson();
    // Klasörleri izlemeye başla
    watchFolders();
}
// Programı başlat
init();
// Çıkış sinyallerini yakala
process.on('SIGINT', () => {
    console.log('\n👋 İzleme durduruldu. Program kapatılıyor...');
    process.exit();
});
const directories = [
    'resources/wallpapers/vertical/all',
    'resources/wallpapers/horizontal/all',
    'resources/wallpapers/square/all'
];
directories.forEach(async dir => {
    const files = await fs.readdir(dir);
    const images = files.filter(file => file.endsWith('.jpg'));
    const imageList = images.map(image => ({
        original: image,
        preview: `preview/${image.replace('.jpg', '.webp')}`
    }));
    const jsonContent = JSON.stringify({ images: imageList }, null, 2);
    await fs.writeFile(path.join(dir, 'images.json'), jsonContent);
});
