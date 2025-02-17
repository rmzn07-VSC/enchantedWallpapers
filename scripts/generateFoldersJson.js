const fs = require('fs').promises;
const path = require('path');
async function generateFoldersJson() {
    try {
        // Ana resources/wallpapers klasörünü kontrol et ve gerekirse oluştur
        const wallpapersPath = path.join(__dirname, '..', 'resources', 'wallpapers');
        await fs.mkdir(wallpapersPath, { recursive: true });
        // Alt klasörleri oluştur
        const types = ['vertical', 'horizontal', 'square'];
        for (const type of types) {
            const typePath = path.join(wallpapersPath, type, 'all');
            await fs.mkdir(typePath, { recursive: true });
        }
        // Klasör yapısını JSON'a kaydet
        const structure = {
            vertical: [],
            horizontal: [],
            square: []
        };
        // Her klasördeki resimleri tara
        for (const type of types) {
            const typePath = path.join(wallpapersPath, type, 'all');
            const files = await fs.readdir(typePath);
            structure[type] = files.filter(file => 
                /\.(jpg|jpeg|png|webp)$/i.test(file)
            );
        }
        // JSON dosyasını kaydet
        const jsonPath = path.join(wallpapersPath, 'structure.json');
        await fs.writeFile(jsonPath, JSON.stringify(structure, null, 2));
        console.log('✅ Klasör yapısı oluşturuldu ve JSON dosyası kaydedildi');
        console.log('📁 Oluşturulan yapı:', structure);
    } catch (error) {
        console.error('❌ Hata:', error);
    }
}
// Scripti çalıştır
generateFoldersJson();
