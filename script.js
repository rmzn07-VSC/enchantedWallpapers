// Global değişkenleri en üste taşıyalım
let lastDownloadTime = Date.now();
const DOWNLOAD_COOLDOWN = 15000;
let activeMessageBox = null;
let pageLoadTime = Date.now();
let isPageLoadCooldownActive = true;
let images = []; // Boş array olarak tanımla
// Dosya yolu sabitleri
const PATHS = {
    VERTICAL: 'resources/wallpapers/vertical/all',
    HORIZONTAL: 'resources/wallpapers/horizontal/all',
    SQUARE: 'resources/wallpapers/square/all'
};
// Sayfa yüklendiğinde resimleri bir kez yükle ve önbellekte tut
let cachedImages = {};
// Sayfalama için global değişkenler ekle
let currentPageNumber = 1;
let imagesPerPage = 30;
// Sayfa durumunu localStorage'da tutmak için
const PAGE_STATE = {
    currentPage: 1,
    scrollPosition: 0,
    lastViewedImage: null
};
// Sayfa durumunu kaydet
function savePageState() {
    const currentPath = window.location.pathname;
    const state = {
        currentPage: currentPageNumber,
        scrollPosition: window.scrollY,
        lastViewedImage: document.querySelector('#modalImage')?.src || null
    };
    localStorage.setItem(`pageState_${currentPath}`, JSON.stringify(state));
}
// Sayfa durumunu yükle fonksiyonunu güncelle - scrollPosition'ı kaldır
function loadPageState() {
    const currentPath = window.location.pathname;
    const savedState = localStorage.getItem(`pageState_${currentPath}`);
    if (savedState) {
        const state = JSON.parse(savedState);
        currentPageNumber = state.currentPage;
        // scroll pozisyonunu kullanma
        return state;
    }
    return null;
}
// Global değişkenlere ekle
const IMAGE_CACHE = new Map();
const PRELOAD_BATCH_SIZE = 5;
const PREFETCH_DISTANCE = 2; // Kaç sayfa önceden yüklenecek
// Global değişkenlerde imagesPerPage'i dinamik hale getir
const PAGE_LIMITS = {
    'index.html': 30,
    'yatay.html': 20,
    'kare.html': 32
};
// Image optimizasyonları için yeni sabitler ekle
const IMAGE_OPTIMIZATIONS = {
    thumbnailSize: '400w',
    mediumSize: '800w',
    fullSize: '1600w',
    quality: 80,
    format: 'webp'
};
// Resim URL'lerini optimize et
function getOptimizedImageUrl(originalSrc, size = 'medium', format = 'webp') {
    const sizeMap = {
        thumbnail: IMAGE_OPTIMIZATIONS.thumbnailSize,
        medium: IMAGE_OPTIMIZATIONS.mediumSize,
        full: IMAGE_OPTIMIZATIONS.fullSize
    };
    return `${originalSrc}?format=${format}&quality=${IMAGE_OPTIMIZATIONS.quality}&size=${sizeMap[size]}`;
}
// Responsive images için srcset oluştur
function createResponsiveImage(img, src) {
    img.srcset = `
        ${getOptimizedImageUrl(src, 'thumbnail', 'webp')} 400w,
        ${getOptimizedImageUrl(src, 'medium', 'webp')} 800w,
        ${getOptimizedImageUrl(src, 'full', 'webp')} 1600w
    `;
    img.sizes = '(max-width: 400px) 100vw, (max-width: 800px) 50vw, 33vw';
}
// Performans metrikleri için izleme ekle
const performanceMetrics = {
    loadTimes: [],
    cacheHits: 0,
    cacheMisses: 0
};
// Resim önbelleğini daha etkili yönet
function manageImageCache() {
    const maxCacheSize = 100; // MB cinsinden
    let currentCacheSize = 0;
    // Önbellek boyutunu doğru hesaplama
    IMAGE_CACHE.forEach((value) => {
        // Base64 string boyutunu hesapla
        currentCacheSize += (value.length * 3) / 4; // Base64 to byte conversion
    });
    if (currentCacheSize > maxCacheSize * 1024 * 1024) { // MB'ı byte'a çevir
        // En eski girişleri kaldır
        const entriesToRemove = Array.from(IMAGE_CACHE.entries())
            .slice(0, Math.floor(IMAGE_CACHE.size * 0.2));
        entriesToRemove.forEach(([key]) => {
            IMAGE_CACHE.delete(key);
        });
    }
}
// Periyodik önbellek temizliği
setInterval(manageImageCache, 60000); // Her dakika kontrol et
// Global değişkenlerin altına throttle fonksiyonunu ekleyin
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements
    // Event delegation for better performance
    document.body.addEventListener('click', function(e) {
        if (e.target.matches('.img-fluid')) {
            handleImageClick(e);
        } else if (e.target.matches('[title="random"]')) {
            handleRandomClick(e);
        }
    });
    // Throttled scroll handler
    window.addEventListener('scroll', throttle(() => {
        requestAnimationFrame(() => updateScrollProgress());
    }, 100));
    // Sayfa tipini belirle ve body'ye ekle
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pageType = currentPage.replace('.html', '');
    document.body.setAttribute('data-page', pageType);
    const images = [
        'image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg',
        'image5.jpg', 'image6.jpg', 'image7.jpg', 'image8.jpg',
        'image9.jpg', 'image10.jpg', 'image11.jpg', 'image12.jpg',
        // Aynı resimleri tekrar ekleyelim
        'image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg',
        'image5.jpg', 'image6.jpg'
    ];
    const modalImage = document.getElementById('modalImage');
    // Sayfa tipine göre resimleri filtrele ve göster
    async function displayImages(page = null) {
        const wallpaperGrid = document.getElementById('wallpapers');
        let currentImages = []; // Yerel değişken olarak tanımla
        try {
            // Loading spinner ekle
            wallpaperGrid.innerHTML = `
                <div class="loading-wrapper">
                    <div class="loading-spinner"></div>
                </div>
            `;
            // Minimum 1 saniyelik beklemeyi kaldır
            // await new Promise(resolve => setTimeout(resolve, 1000));
            // Sayfa numarasını belirle
            const savedState = loadPageState();
            currentPageNumber = page || savedState?.currentPage || 1;
            if (page) {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
            // Sayfa tipini ve base path'i belirle
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            let basePath;
            switch (currentPage) {
                case 'yatay.html': basePath = PATHS.HORIZONTAL; break;
                case 'kare.html': basePath = PATHS.SQUARE; break;
                default: basePath = PATHS.VERTICAL;
            }
            // Dosya varlığını kontrol et
            const response = await fetch(`${basePath}/images.json`);
            if (!response.ok) {
                throw new Error('images.json bulunamadı');
            }
            // Önbellekte yoksa resimleri yükle
            if (!cachedImages[currentPage]) {
                wallpaperGrid.innerHTML = '<div class="loading">Resimler yükleniyor...</div>';
                const data = await response.json();
                currentImages = data.images; // Yerel değişkene ata
                cachedImages[currentPage] = currentImages.sort();
            } else {
                currentImages = cachedImages[currentPage]; // Önbellekten al
            }
            // Sayfa tipine göre resim limitini belirle
            const imagesPerPage = PAGE_LIMITS[currentPage] || 30; // Varsayılan 30
            const start = (page - 1) * imagesPerPage;
            const end = start + imagesPerPage;
            // Grid'i temizle ve resimleri ekle
            wallpaperGrid.innerHTML = '';
            const fragment = document.createDocumentFragment();
            currentImages.slice(start, end).forEach(image => {
                const div = document.createElement('div');
                div.className = currentPage === 'yatay.html' ? 'col-landscape' : 'col-lg-2_4';
                // Resim konteyneri oluştur
                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-container';
                // Resim elementi
                const img = document.createElement('img');
                img.className = 'img-fluid lazy loading-fade';
                img.dataset.src = `${basePath}/${image.original}`;
                img.src = `${basePath}/${image.preview}`;
                img.addEventListener('click', (e) => e.preventDefault());
                img.dataset.bsToggle = 'modal';
                img.dataset.bsTarget = '#imageModal';
                img.loading = 'lazy';
                // Alt attribute'unu kaldır
                // img.alt = 'Duvar Kağıdı'; 
                // Yükleme çemberi ekle
                const spinner = document.createElement('div');
                spinner.className = 'loading-spinner';
                // Yükleme tamamlandığında
                img.onload = async function() {
                    const size = await getImageSize(`${basePath}/${image.original}`);
                    const resolution = `${this.naturalWidth} x ${this.naturalHeight}`;
                    const sizeInMB = (size / (1024 * 1024)).toFixed(2);
                    imageInfo.innerHTML = `
                        <span><i class="fas fa-image"></i> &nbsp;${resolution}</span>
                        <span><i class="fas fa-weight"></i> &nbsp;${sizeInMB} MB</span>
                    `;
                    img.classList.add('loaded');
                };
                // Resim bilgi overlay'ını ekle
                const imageInfo = document.createElement('div');
                imageInfo.className = 'image-info';
                // Resim yüklendiğinde boyut ve çözünürlük bilgilerini al
                img.onload = async function() {
                    const size = await getImageSize(`${basePath}/${image.original}`);
                    const resolution = `${this.naturalWidth} x ${this.naturalHeight}`;
                    const sizeInMB = (size / (1024 * 1024)).toFixed(2);
                    imageInfo.innerHTML = `
                        <span><i class="fas fa-image"></i> &nbsp; ${resolution}</span>
                        <span><i class="fas fa-weight"></i> &nbsp; ${sizeInMB} MB</span>
                    `;
                };
                imageContainer.appendChild(img);
                imageContainer.appendChild(imageInfo);
                div.appendChild(imageContainer);
                fragment.appendChild(div);
            });
            wallpaperGrid.appendChild(fragment);
            // Resimleri sırayla göster
            const imgs = wallpaperGrid.querySelectorAll('.img-fluid');
            imgs.forEach((img, index) => {
                setTimeout(() => {
                    img.classList.add('show');
                }, index * 100); // Her resim arasında 100ms bekle
            });
            // Önce context menu listener'larını ekle
            setupContextMenuListeners();
            // Sonra diğer işlemleri yap
            initLazyLoading();
            updatePagination(currentPageNumber, Math.ceil(currentImages.length / imagesPerPage));
            setupModal();
            // Her sayfa değişiminde durumu kaydet
            savePageState();
            // Prefetch sonraki sayfaların resimlerini
            prefetchImages(currentPageNumber);
        } catch (error) {
            console.error('Resimler yüklenirken hata:', error);
            wallpaperGrid.innerHTML = `
                <div class="alert alert-danger">
                    Resimler yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.
                    <br>
                    <small class="text-muted">${error.message}</small>
                </div>`;
        }
    }
    // Tüm klasörleri dinamik olarak tarama fonksiyonu
    // Dikey resimleri filtreleme fonksiyonunu güncelle
    // Yatay resimleri filtreleme fonksiyonu
    // Kare resimleri filtreleme fonksiyonu
    // Resim oranı kontrolü fonksiyonunu güncelle
    // Sayfalama butonlarını güncelleme fonksiyonunu güncelle
    function updatePagination(currentPage, totalPages) {
        const pagination = document.querySelector('.pagination');
        const paginationItems = [];
        // Önceki sayfa butonu - sadece ilk sayfa değilse göster
        if (currentPage > 1) {
            paginationItems.push(`
                <li class="page-item">
                    <a class="page-link" href="#" data-page="${currentPage - 1}">
                        <i class="fas fa-chevron-left"></i> Önceki
                    </a>
                </li>
            `);
        }
        // Sayfa numaralarını hazırla
        let pages = [];
        if (totalPages <= 5) {
            // 5 veya daha az sayfa varsa hepsini göster
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            // 5'ten fazla sayfa varsa akıllı sayfalama yap
            if (currentPage <= 3) {
                // Başlangıç sayfalarındaysa
                pages = [1, 2, 3, 4, '...', totalPages];
            } else if (currentPage >= totalPages - 2) {
                // Son sayfalardaysa
                pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                // Ortadaki sayfalardaysa
                pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
            }
        }
        // Sayfa numaralarını ekle
        pages.forEach(page => {
            if (page === '...') {
                paginationItems.push(`
                    <li class="page-item disabled">
                        <span class="page-link">...</span>
                    </li>
                `);
            } else {
                paginationItems.push(`
                    <li class="page-item ${page === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" data-page="${page}">${page}</a>
                    </li>
                `);
            }
        });
        // Sonraki sayfa butonu - sadece son sayfa değilse göster
        if (currentPage < totalPages) {
            paginationItems.push(`
                <li class="page-item">
                    <a class="page-link" href="#" data-page="${currentPage + 1}">
                        Sonraki <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `);
        }
        pagination.innerHTML = paginationItems.join('');
        // Event listener'ları ekle
        pagination.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const pageNum = e.target.closest('.page-link').dataset.page;
                if (pageNum) {
                    const newPage = parseInt(pageNum);
                    if (!isNaN(newPage) && newPage !== currentPage) {
                        // Önce scroll'u sıfırla
                        window.scrollTo({
                            top: 0,
                            behavior: 'instant'
                        });
                        // Sayfa içeriğini güncelle
                        currentPageNumber = newPage;
                        await displayImages(newPage);
                        savePageState();
                    }
                }
            });
        });
    }
    // Tema değiştirme fonksiyonunu güncelleyelim
    function initThemeToggle() {
      const themeToggle = document.querySelector('.theme-toggle');
      const themeIcon = themeToggle.querySelector('i');
      const themeText = document.createElement('span');
      // Icon container oluştur
      const iconContainer = document.createElement('div');
      iconContainer.className = 'icon-container';
      // Mevcut ikonu container'a taşı ve yeni icon ekle
      themeIcon?.remove(); // Optional chaining ekledik
      iconContainer.innerHTML =
        '<i class="fas fa-moon"></i><i class="fas fa-sun"></i>';
      // Mevcut temayı yükle
      const currentTheme = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      // Text'i güncelle
      themeText.textContent =
        currentTheme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
      // Elementleri butona ekle
      themeToggle.innerHTML = ''; // Mevcut içeriği temizle
      themeToggle.appendChild(themeText);
      themeToggle.appendChild(iconContainer);
      // Tema değiştirme olayı
      themeToggle.addEventListener('click', () => {
        const currentTheme =
          document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        // Text'i güncelle
        themeText.textContent =
          newTheme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
      });
    }
    // Tüm sayfalarda tema değiştirmeyi başlat
    initThemeToggle();
    // Wallpaper display ve diğer işlemleri sadece gerekli sayfalarda yap
    if (!window.location.pathname.includes('hakkimizda.html')) {
        const savedState = loadPageState();
        if (savedState) {
            displayImages(savedState.currentPage);
        } else {
            displayImages(1);
        }
        initRatioSelector();
        // ... diğer wallpaper ile ilgili işlemler ...
    }
    // Tüm resimleri seç (grid oluşturulduktan sonra)
    const wallpapers = document.querySelectorAll('.img-fluid');
    // Debug için konsola resim oranlarını yazdır
    wallpapers.forEach(img => {
        img.onload = function() {
            const ratio = this.naturalWidth / this.naturalHeight;
            console.log(`${img.src}: ${ratio.toFixed(2)}`);
        }
    });
    // Modal için click event
    wallpapers.forEach(img => {
        img.addEventListener('click', function() {
            modalImage.src = this.src;
            new bootstrap.Modal(document.getElementById('imageModal')).show();
        });
    });
    // Rastgele butonu
    const randomBtn = document.querySelector('[title="random"]');
    randomBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const randomImage = images[Math.floor(Math.random() * images.length)];
        modalImage.src = `wallpapers/${randomImage}`;
        new bootstrap.Modal(document.getElementById('imageModal')).show();
    });
    // Rastgele butonu için event listener güncelleme
    document.querySelector('[title="random"]').addEventListener('click', async function(e) {
        e.preventDefault();
        try {
            // Mevcut sayfadaki tüm resimleri seç
            const allImages = document.querySelectorAll('.img-fluid');
            if (allImages.length === 0) return;
            // Rastgele bir resim seç
            const randomIndex = Math.floor(Math.random() * allImages.length);
            const randomImage = allImages[randomIndex];
            // Modal'ı göster
            const modalImage = document.getElementById('modalImage');
            const modal = document.getElementById('imageModal');
            const modalBody = modal.querySelector('.modal-body');
            modalBody.classList.add('loading');
            modalImage.classList.remove('loaded');
            // Orijinal (HD) resmi göster
            modalImage.src = randomImage.dataset.src;
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();
            modalImage.onload = () => {
                modalBody.classList.remove('loading');
                modalImage.classList.add('loaded');
            };
        } catch (error) {
            console.error('Rastgele resim gösterilirken hata:', error);
        }
    });
    // Scroll progress göstergesi
    const scrollProgress = document.querySelector('.scroll-progress');
    window.addEventListener('scroll', () => {
        const totalScroll = document.documentElement.scrollTop;
        const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scroll = `${totalScroll / windowHeight}`;
        scrollProgress.style.transform = `scaleX(${scroll})`;
        scrollProgress.style.opacity = scroll;
    });
    // Smooth scroll
    document.documentElement.classList.add('smooth-scroll');
    // Sayfa yüklendiğinde tema kontrolü
    document.addEventListener('DOMContentLoaded', () => {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        const themeIcon = document.querySelector('.theme-toggle i');
        themeIcon.classList.toggle('fa-sun', currentTheme === 'light');
        themeIcon.classList.toggle('fa-moon', currentTheme === 'dark');
    });
    // Ekran düzeni filtresi
    const ratioFilters = document.querySelectorAll('.dropdown-item[data-ratio]');
    ratioFilters.forEach(filter => {
        filter.addEventListener('click', (e) => {
            e.preventDefault();
            const ratio = filter.getAttribute('data-ratio');
            ratioFilters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            // Satırları göster/gizle
            document.getElementById('landscape-row').style.display = (ratio === 'all' || ratio === 'landscape') ? 'flex' : 'none';
            document.getElementById('portrait-row').style.display = (ratio === 'all' || ratio === 'portrait') ? 'flex' : 'none';
            document.getElementById('square-row').style.display = (ratio === 'all' || ratio === 'square') ? 'flex' : 'none';
        });
    });
    // Aktif ratio butonunu işaretle
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        if (btn.getAttribute('href') === currentPage) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    // Sidebar küçültme/büyütme fonksiyonu - basitleştirilmiş versiyon
    function handleSidebarResize() {
        const footer = document.querySelector('.custom-footer');
        const sidebar = document.querySelector('.sidebar');
        const footerTop = footer.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        const threshold = -47; // Footer'a yaklaşma eşiğini artırdık (piksel cinsinden)
        if (footerTop - windowHeight < threshold) {
            sidebar.classList.add('shrink');
        } else {
            sidebar.classList.remove('shrink');
        }
    }
    // Throttle fonksiyonu ekle
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
    // Event listener'ları throttle ile optimize et
    window.addEventListener('scroll', throttle(() => {
        requestAnimationFrame(handleSidebarResize);
    }, 100));
    // Sayfa yüklendiğinde kontrol et
    window.addEventListener('load', handleSidebarResize);
    window.addEventListener('resize', handleSidebarResize);
    // Ratio selector için yeni fonksiyon
    function initRatioSelector() {
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.preventDefault();
                const targetPage = this.getAttribute('href');
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                // Aynı sayfaya tıklandıysa işlem yapma
                if (targetPage === currentPage) {
                    return;
                }
                // beforeunload event listener'ını kaldır
                window.removeEventListener('beforeunload', beforeUnloadHandler);
                // Sayfayı yenile
                window.location.href = targetPage;
            });
        });
    }
    // Loading animasyonu için CSS ekle
    const style = document.createElement('style');
    style.textContent = `
        .loading {
            width: 100%;
            text-align: center;
            padding: 2rem;
            color: var(--text-color);
            font-size: 1.2rem;
            opacity: 0.7;
        }
    `;
    document.head.appendChild(style);
    initRatioSelector();
    // Geri dönüş butonu için event listener güncelleme
    const backButton = document.querySelector('.back-to-wallpapers');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    // Browser geri/ileri butonları için event listener güncelleme
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.previousUrl) {
            window.location.href = e.state.previousUrl;
        } else {
            window.location.href = '/';
        }
    });
    // Sayfa yüklenir yüklenmez indirme mesajını göster
    showDownloadMessage(15);
    // 15 saniye sonra indirmeye izin ver
    setTimeout(() => {
        isPageLoadCooldownActive = false;
    }, DOWNLOAD_COOLDOWN);
    // Navbar dışı tıklamaları dinle ve menüyü kapat
    const navbar = document.querySelector('.navbar');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    document.addEventListener('click', function(e) {
        // Eğer navbar açıksa ve tıklanan element navbar'ın dışındaysa
        if (navbarCollapse.classList.contains('show') && 
            !navbar.contains(e.target) && 
            !e.target.classList.contains('navbar-toggler')) {
            // Bootstrap'in collapse metodunu kullanarak menüyü kapat
            bootstrap.Collapse.getInstance(navbarCollapse).hide();
        }
    });
});
// Modal işlemleri için yeni fonksiyonlar
function getDominantColor(imgElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 50; // Küçük bir boyut kullanarak performansı artır
    const height = 50;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(imgElement, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height).data;
    let r = 0, g = 0, b = 0;
    // Tüm piksellerin ortalamasını al
    for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
    }
    const pixelCount = imageData.length / 4;
    r = Math.floor(r / pixelCount);
    g = Math.floor(g / pixelCount);
    b = Math.floor(b / pixelCount);
    return { r, g, b };
}
// İndirme işlemi için fonksiyon
function handleDownload(imgElement) {
    const currentTime = Date.now();
    const timeSinceLastDownload = currentTime - lastDownloadTime;
    if (timeSinceLastDownload < DOWNLOAD_COOLDOWN) {
        showDownloadMessage(Math.ceil((DOWNLOAD_COOLDOWN - timeSinceLastDownload) / 1000));
        return;
    }
    // HD versiyonun yolunu belirle
    let hdImageUrl;
    if (imgElement.dataset.src) {
        // Grid'deki resimlerden indirme
        hdImageUrl = imgElement.dataset.src;
    } else {
        // Modal'daki resimden indirme
        hdImageUrl = imgElement.src.replace('/preview/', '/').replace('.webp', '.jpg');
    }
    // Orijinal dosya adını al ve yeni formatta düzenle
    const timestamp = new Date().getTime();
    const newFileName = `EnchantedWallpapers_${timestamp}.jpg`;
    // İndirme işlemini gerçekleştir
    const downloadLink = document.createElement('a');
    downloadLink.href = hdImageUrl;
    downloadLink.download = newFileName; // Yeni dosya adını kullan
    document.body.appendChild(downloadLink);
    // İndirmeyi başlat
    downloadLink.click();
    document.body.removeChild(downloadLink);
    // Zamanlayıcıyı güncelle ve progress bar'ı göster
    lastDownloadTime = currentTime;
    showCountdownProgress(15);
}
// Mesaj kutusu gösterme fonksiyonu güncellendi
function showDownloadMessage(remainingSeconds) {
    // Tüm sayfalarda çalışması için sayfa kontrolü ekle
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const validPages = ['index.html', 'yatay.html', 'kare.html'];
    if (!validPages.includes(currentPage)) return;
    // Sayfa yüklenme zamanından itibaren 2 saniye geçmemişse mesajı gösterme
    if (Date.now() - pageLoadTime < 2000) return;
    // Eğer aktif mesaj kutusu varsa, sadece süreyi güncelle
    if (activeMessageBox) {
        const timerElement = activeMessageBox.querySelector('.timer');
        timerElement.textContent = remainingSeconds;
        // Mesaj zaten görünüyorsa zamanlayıcıyı sıfırla
        clearTimeout(activeMessageBox.hideTimeout);
        clearTimeout(activeMessageBox.removeTimeout);
        // 3 saniye sonra mesajı gizle
        activeMessageBox.hideTimeout = setTimeout(() => {
            activeMessageBox.classList.remove('show');
            activeMessageBox.removeTimeout = setTimeout(() => {
                activeMessageBox.remove();
                activeMessageBox = null;
            }, 300);
        }, 3000);
        return;
    }
    // Yeni mesaj kutusu oluştur
    const messageBox = document.createElement('div');
    messageBox.className = `download-message ${currentPage.replace('.html', '')}-page`;
    messageBox.innerHTML = `
        <i class="fas fa-clock"></i>
        <span>Lütfen bekleyin: <span class="timer">${remainingSeconds}</span> saniye</span>
    `;
    document.body.appendChild(messageBox);
    activeMessageBox = messageBox;
    // Animasyon için setTimeout kullan
    setTimeout(() => messageBox.classList.add('show'), 15);
    // 3 saniye sonra mesajı gizle
    messageBox.hideTimeout = setTimeout(() => {
        messageBox.classList.remove('show');
        messageBox.removeTimeout = setTimeout(() => {
            messageBox.remove();
            activeMessageBox = null;
        }, 300);
    }, 3000);
    // Geri sayım başlat
    const timerElement = messageBox.querySelector('.timer');
    let timeLeft = remainingSeconds;
    const countdown = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(countdown);
        } else {
            timerElement.textContent = timeLeft;
        }
    }, 1000);
    // Sayfa değiştiğinde mesaj kutusunu temizle
    window.addEventListener('beforeunload', () => {
        if (activeMessageBox) {
            activeMessageBox.remove();
            activeMessageBox = null;
        }
    });
}
// Modal işlemleri için fonksiyonu güncelle
function setupModal() {
    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('imageModal');
    const modalBody = modal.querySelector('.modal-body');
    let isZooming = false;
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let currentScale = 1;
    let lastClickTime = 0;
    // Transform güncelleme fonksiyonu - animasyon parametresi eklendi
    function updateImageTransform(withAnimation = false) {
        if (withAnimation) {
            modalImage.style.transition = 'transform 0.3s ease-out';
            setTimeout(() => {
                modalImage.style.transition = 'none';
            }, 300);
        } else {
            modalImage.style.transition = 'none';
        }
        modalImage.style.transform = `scale(${currentScale}) translate(${translateX}px, ${translateY}px)`;
    }
    // Resmi ortala fonksiyonu
    function centerImage(withAnimation = true) {
        translateX = 0;
        translateY = 0;
        currentScale = 1;
        updateImageTransform(withAnimation);
    }
    // Resmi büyüt fonksiyonu
    function zoomImage(withAnimation = true) {
        translateX = 0;
        translateY = 0;
        currentScale = 2; // İstediğiniz zoom seviyesi
        updateImageTransform(withAnimation);
    }
    // Çift tıklama olayı
    modalImage.addEventListener('click', () => {
        const clickTime = Date.now();
        // Çift tıklama kontrolü (300ms içinde)
        if (clickTime - lastClickTime < 300) {
            // Eğer resim zaten büyütülmüşse küçült, değilse büyüt
            if (currentScale > 1) {
                centerImage(true);
            } else {
                zoomImage(true);
            }
        }
        lastClickTime = clickTime;
    });
    // Mouse hareketi takibi
    document.addEventListener('mousemove', (e) => {
        if (!isZooming) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateImageTransform(false);
    });
    // Mouse tuşu bırakıldığında
    document.addEventListener('mouseup', () => {
        if (isZooming) {
            isZooming = false;
            modalBody.classList.remove('zooming');
            modalImage.classList.remove('zoom-mode');
            centerImage(true);
        }
    });
    // Mouse tuşuna basıldığında
    modalImage.addEventListener('mousedown', (e) => {
        // Çift tıklama değilse sürüklemeye başla
        if (Date.now() - lastClickTime > 300) {
            isZooming = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            modalBody.classList.add('zooming');
            modalImage.classList.add('zoom-mode');
        }
    });
    // Tekerlek ile zoom
    modalImage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
        currentScale = Math.min(Math.max(currentScale * scaleAmount, 1), 3);
        updateImageTransform();
    });
    // Modal olayları
    modal.addEventListener('shown.bs.modal', () => {
        savePageState();
    });
    modal.addEventListener('hide.bs.modal', () => {
        isZooming = false;
        modalBody.classList.remove('zooming');
        modalImage.classList.remove('zoom-mode');
        modalImage.style.transform = '';
        translateX = 0;
        translateY = 0;
        currentScale = 1;
    });
    // ESC tuşu kontrolü
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            modalInstance.hide();
        }
    });
    // Dışarı tıklama ile kapatmayı devre dışı bırak
    modal.addEventListener('click', (e) => {
        if (e.target === modal && !isZooming) {
            e.stopPropagation();
        }
    });
    // İndirme olayı için context menu (sağ tık) listener'ı ekle
    modalImage.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        handleDownload(this);
    });
    // Grid'deki küçük resimler için de aynı özelliği ekle
    document.querySelectorAll('.img-fluid').forEach(img => {
        img.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            handleDownload(this);
        });
    });
    // Kapatma butonu oluştur
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    modalBody.appendChild(closeBtn); // Butonu modalBody'e ekle
    // Kapatma butonu click olayı
    closeBtn.addEventListener('click', () => {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
            // Modal kapandıktan sonra temizlik yap
            setTimeout(() => {
                modalImage.style.transform = '';
                translateX = 0;
                translateY = 0;
                currentScale = 1;
                isZooming = false;
                modalBody.classList.remove('zooming');
                modalImage.classList.remove('zoom-mode');
                // Backdrop'u temizle
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) backdrop.remove();
                // Body class'larını temizle
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }, 300);
        }
    });
    // Modal hidden event'i
    modal.addEventListener('hidden.bs.modal', () => {
        modalImage.style.transform = '';
        translateX = 0;
        translateY = 0;
        currentScale = 1;
        isZooming = false;
        modalBody.classList.remove('zooming');
        modalImage.classList.remove('zoom-mode');
        // Backdrop'u temizle
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        // Body class'larını temizle
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    });
    // Mouse/touch olaylarında buton görünürlüğünü kontrol et
    let buttonTimeout;
    function showCloseButton() {
        closeBtn.style.opacity = '1';
        closeBtn.style.pointerEvents = 'auto';
    }
    function hideCloseButton() {
        closeBtn.style.opacity = '0';
        closeBtn.style.pointerEvents = 'none';
    }
    function resetButtonVisibility() {
        clearTimeout(buttonTimeout);
        buttonTimeout = setTimeout(showCloseButton, 300);
    }
    // Mouse/touch hareketi dinleyicileri
    modalBody.addEventListener('mousemove', resetButtonVisibility);
    modalBody.addEventListener('touchstart', resetButtonVisibility);
    modalBody.addEventListener('touchend', resetButtonVisibility);
    // Zoom durumunda butonu gizle
    document.addEventListener('mousemove', () => {
        if (isZooming) {
            hideCloseButton();
        }
    });
    // Zoom bittiğinde butonu göster
    document.addEventListener('mouseup', () => {
        if (isZooming) {
            resetButtonVisibility();
        }
    });
    // Resim yüklendiğinde butonu göster
    modalImage.addEventListener('load', () => {
        if (modalImage.classList.contains('loaded')) {
            closeBtn.classList.add('show');
        }
    });
    // Modal kapanırken butonu gizle
    modal.addEventListener('hide.bs.modal', () => {
        closeBtn.classList.remove('show');
    });
}
// Ayrıca style.css dosyasına şu CSS'i ekleyin:
const style = document.createElement('style');
style.textContent = String.raw`
    .modal-info {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        z-index: 1061;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    .modal-info.show {
        opacity: 1;
    }
    .modal-info i {
        margin-right: 6px;
        font-size: 12px;
    }
`;
document.head.appendChild(style);
// displayImages fonksiyonu sadeleştirildi
async function displayImages() {
    const wallpaperGrid = document.getElementById('wallpapers');
    wallpaperGrid.innerHTML = '';
    const filteredImages = await Promise.all(
        images.map(async (image) => {
            const shouldDisplay = await checkImageRatio(image);
            return shouldDisplay ? image : null;
        })
    );
    const validImages = filteredImages.filter(img => img !== null);
    const fragment = document.createDocumentFragment();
    validImages.forEach(image => {
        const div = document.createElement('div');
        div.className = currentPage === 'yatay.html' ? 'col-landscape' : 'col-lg-2_4';
        div.innerHTML = `
            <img 
                class="img-fluid" 
                src="wallpapers/${image}"
                alt="Duvar Kağıdı"
                loading="lazy"
                data-bs-toggle="modal" 
                data-bs-target="#imageModal">
        `;
        fragment.appendChild(div);
    });
    wallpaperGrid.appendChild(fragment);
    setupModal();
}
// Rastgele butonu - güncellendi
const randomBtn = document.querySelector('[title="random"]');
if (randomBtn) {
    randomBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const randomImage = images[Math.floor(Math.random() * images.length)];
        const modalImage = document.getElementById('modalImage');
        const modal = document.getElementById('imageModal');
        // Tam yolu kullanarak resmi ayarla
        const fullPath = `wallpapers/${randomImage}`;
        modalImage.src = fullPath;
        // Resim yüklendikten sonra modalı göster
        modalImage.onload = function() {
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();
        };
    });
}
// Sidebar'ın yükleme anında açık başlaması için
window.addEventListener('load', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.remove('shrink');
    // Sidebar boyutunu pencere yüksekliğine göre ayarla
    function setSidebarHeight() {
        const windowHeight = window.innerHeight;
        const navbarHeight = document.querySelector('.navbar').offsetHeight;
        const availableHeight = windowHeight - navbarHeight - 20; // 20px margin
        sidebar.style.height = `${availableHeight}px`;
    }
    // İlk yüklemede ve pencere boyutu değiştiğinde çalıştır
    setSidebarHeight();
    window.addEventListener('resize', setSidebarHeight);
});
// handleSidebarResize fonksiyonunu güncelle
function handleSidebarResize() {
    const footer = document.querySelector('.custom-footer');
    const sidebar = document.querySelector('.sidebar');
    const footerTop = footer.getBoundingClientRect().top;
    const windowHeight = window.innerHeight;
    const threshold = -47;
    // Sadece footer'a yaklaştığında küçült
    if (footerTop - windowHeight < threshold) {
        sidebar.classList.add('shrink');
    } else {
        sidebar.classList.remove('shrink');
    }
}
// İndirme işlemi için fonksiyonu güncelle
function handleDownload(imgElement) {
    const currentTime = Date.now();
    const timeSinceLastDownload = currentTime - lastDownloadTime;
    if (timeSinceLastDownload < DOWNLOAD_COOLDOWN) {
        showDownloadMessage(Math.ceil((DOWNLOAD_COOLDOWN - timeSinceLastDownload) / 1000));
        return;
    }
    // HD versiyonun yolunu belirle
    let hdImageUrl;
    if (imgElement.dataset.src) {
        // Grid'deki resimlerden indirme
        hdImageUrl = imgElement.dataset.src;
    } else {
        // Modal'daki resimden indirme
        hdImageUrl = imgElement.src.replace('/preview/', '/').replace('.webp', '.jpg');
    }
    // Orijinal dosya adını al ve yeni formatta düzenle
    const timestamp = new Date().getTime();
    const newFileName = `EnchantedWallpapers_${timestamp}.jpg`;
    // İndirme işlemini gerçekleştir
    const downloadLink = document.createElement('a');
    downloadLink.href = hdImageUrl;
    downloadLink.download = newFileName; // Yeni dosya adını kullan
    document.body.appendChild(downloadLink);
    // İndirmeyi başlat
    downloadLink.click();
    document.body.removeChild(downloadLink);
    // Zamanlayıcıyı güncelle ve progress bar'ı göster
    lastDownloadTime = currentTime;
    showCountdownProgress(15);
}
// Progress bar için tek bir instance tut
let currentProgressBar = null;
function showCountdownProgress(seconds) {
    // Eğer zaten bir progress bar varsa, yeni oluşturma
    if (currentProgressBar) return;
    // Progress bar oluştur
    const progressContainer = document.createElement('div');
    progressContainer.className = 'countdown-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressContainer.appendChild(progressBar);
    document.body.appendChild(progressContainer);
    currentProgressBar = progressContainer;
    // Progress bar'ı başlat
    requestAnimationFrame(() => {
        progressBar.style.transform = 'scaleX(1)';
        void progressBar.offsetWidth;
        progressBar.style.transform = 'scaleX(0)';
    });
    // Süre sonunda progress bar'ı kaldır
    setTimeout(() => {
        progressContainer.classList.add('complete');
        setTimeout(() => {
            progressContainer.remove();
            currentProgressBar = null;
        }, 300);
    }, seconds * 1000);
}
// Sayfa yüklendiğinde ilk progress bar'ı göster
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    if (!window.location.pathname.includes('hakkimizda.html')) {
        showCountdownProgress(15);
    }
    // ...existing code...
});
document.addEventListener('DOMContentLoaded', function() {
    // Sayfa yüklendiğinde son durumu yükle
    const savedState = loadPageState();
    if (savedState) {
        displayImages(savedState.currentPage);
    } else {
        displayImages(1);
    }
    // Scroll olayını throttle ile optimize et
    window.addEventListener('scroll', throttle(() => {
        savePageState();
    }, 500));
    // ...existing code...
});
// ...existing code...
// Eski showDownloadMessage fonksiyonunu kaldır ve yerine bunu ekle
function setupCountdownProgress() {
    // Progress bar elementlerini oluştur
    const progressContainer = document.createElement('div');
    progressContainer.className = 'countdown-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressContainer.appendChild(progressBar);
    document.body.appendChild(progressContainer);
    // Progress bar'ı başlat
    requestAnimationFrame(() => {
        progressBar.style.transform = 'scaleX(0)';
    });
    // 15 saniye sonra progress bar'ı kaldır
    setTimeout(() => {
        progressContainer.classList.add('complete');
        setTimeout(() => {
            progressContainer.remove();
        }, 300);
        isPageLoadCooldownActive = false;
    }, DOWNLOAD_COOLDOWN);
}
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    // Eski showDownloadMessage çağrısını değiştir
    if (!window.location.pathname.includes('hakkimizda.html')) {
        setupCountdownProgress();
        setTimeout(() => {
            isPageLoadCooldownActive = false;
        }, DOWNLOAD_COOLDOWN);
    }
    // ...existing code...
});
// Beklenmedik sayfa yenilemelerini önle
window.addEventListener('beforeunload', beforeUnloadHandler);
// BeforeUnload handler'ını ayrı bir fonksiyon olarak tanımla
function beforeUnloadHandler(e) {
    const modalOpen = document.querySelector('.modal.show');
    const downloadInProgress = Date.now() - lastDownloadTime < DOWNLOAD_COOLDOWN;
    if (modalOpen || downloadInProgress) {
        e.preventDefault();
        e.returnValue = '';
    }
}
// ...rest of the code...
// BeforeUnload handler'ını güncelle
function beforeUnloadHandler(e) {
    // Hakkımızda sayfasındaki geri dönüş butonuna tıklandıysa kontrolü ekle
    if (window.location.pathname.includes('hakkimizda.html') && 
        document.querySelector('.back-to-wallpapers:hover')) {
        return;
    }
    const modalOpen = document.querySelector('.modal.show');
    const downloadInProgress = Date.now() - lastDownloadTime < DOWNLOAD_COOLDOWN;
    if (!isAboutPageTransition && (modalOpen || downloadInProgress)) {
        e.preventDefault();
        e.returnValue = '';
    }
}
// Geri dönüş butonu için event listener'ı güncelle
const backButton = document.querySelector('.back-to-wallpapers');
if (backButton) {
    backButton.addEventListener('click', () => {
        // beforeunload event listener'ını kaldır
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        window.location.href = 'index.html';
    });
}
// ...existing code...
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    // Rastgele butonu için event listener'ı güncelle ve düzelt
    const randomBtn = document.querySelector('[title="random"]');
    if (randomBtn) {
        randomBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                // Mevcut sayfadaki tüm resimleri seç
                const allImages = document.querySelectorAll('.img-fluid');
                if (allImages.length === 0) return;
                // Rastgele bir resim seç
                const randomIndex = Math.floor(Math.random() * allImages.length);
                const randomImage = allImages[randomIndex];
                // Modal'ı göster
                const modalImage = document.getElementById('modalImage');
                const modal = document.getElementById('imageModal');
                const modalBody = modal.querySelector('.modal-body');
                modalBody.classList.add('loading');
                modalImage.classList.remove('loaded');
                // Önce düşük kaliteli resmi göster
                modalImage.src = randomImage.src;
                const modalInstance = new bootstrap.Modal(modal);
                modalInstance.show();
                try {
                    // Yüksek kaliteli resmi arka planda yükle
                    await loadImage(modalImage, randomImage.dataset.src, true);
                    modalBody.classList.remove('loading');
                    modalImage.classList.add('loaded');
                    savePageState();
                } catch (error) {
                    console.error('Yüksek kaliteli resim yüklenemedi:', error);
                }
            } catch (error) {
                console.error('Rastgele resim gösterilirken hata:', error);
            }
        });
    }
    // ...existing code...
    // Navbar'daki Hakkımda linkini yakala ve event listener'ı güncelle
    const aboutLink = document.querySelector('.nav-link:has(i.fa-info-circle)');
    if (aboutLink) {
        aboutLink.addEventListener('click', function(e) {
            e.preventDefault();
            // Sayfa değişiminden önce beforeunload event listener'ını kaldır
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            window.location.href = 'hakkimizda.html';
        });
    }
    // ...existing code...
});
// Eski rastgele buton kodlarını kaldır veya yoruma al
// const randomBtn = document.querySelector('[title="random"]');
// randomBtn.addEventListener('click', function(e) {...});
// document.querySelector('[title="random"]').addEventListener('click', async function(e) {...});
// ...existing code...
// Lazy loading için Intersection Observer
function initLazyLoading() {
}
// Resim yükleme fonksiyonunu güncelle
async function loadImage(imgElement, src, isHighQuality = false) {
    if (!src) {
        console.error('Kaynak URL eksik');
        return Promise.reject(new Error('Kaynak URL eksik'));
    }
    // Loading durumunu göster
    imgElement.classList.remove('loaded');
    imgElement.classList.add('loading');
    try {
        // Cache optimization - Önbellekte varsa hemen kullan
        if (IMAGE_CACHE.has(src)) {
            performanceMetrics.cacheHits++;
            imgElement.src = IMAGE_CACHE.get(src);
            imgElement.classList.add('loaded');
            imgElement.classList.remove('loading');
            if (isHighQuality) {
                imgElement.classList.add('high-quality');
                createResponsiveImage(imgElement, src);
            }
            return imgElement;
        }
        // Performance monitoring başlat
        const startTime = performance.now();
        // Yeni resim yükleme
        const image = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            image.onload = () => {
                // Performance metrics güncelle
                const loadTime = performance.now() - startTime;
                performanceMetrics.loadTimes.push(loadTime);
                performanceMetrics.cacheMisses++;
                resolve();
            };
            image.onerror = () => reject(new Error(`Resim yüklenemedi: ${src}`));
        });
        // Timeout ekle
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Resim yükleme zaman aşımı')), 10000);
        });
        // Resmi yüklemeye başla
        image.src = src;
        await Promise.race([loadPromise, timeoutPromise]);
        // Cache management
        if (IMAGE_CACHE.size > 100) { // Önbellek boyut kontrolü
            const oldestKey = IMAGE_CACHE.keys().next().value;
            IMAGE_CACHE.delete(oldestKey);
        }
        IMAGE_CACHE.set(src, src);
        // Resmi uygula ve durumu güncelle
        imgElement.src = src;
        imgElement.classList.add('loaded');
        imgElement.classList.remove('loading');
        // Yüksek kalite ayarları
        if (isHighQuality) {
            imgElement.classList.add('high-quality');
            createResponsiveImage(imgElement, src);
            // Progressive loading için blur efekti
            requestAnimationFrame(() => {
                imgElement.style.filter = 'blur(0px)';
            });
        }
        return imgElement;
    } catch (error) {
        // Hata durumunda
        console.error('Resim yükleme hatası:', error);
        imgElement.classList.remove('loading');
        imgElement.classList.add('error');
        // Fallback image göster
        imgElement.src = 'resources/error-image.jpg';
        throw error;
    }
}
// Prefetch fonksiyonu ekle
async function prefetchImages(page) {
    try {
        const nextPages = Array.from(
            { length: PREFETCH_DISTANCE }, 
            (_, i) => page + i + 1
        );
        for (const pageNum of nextPages) {
            const images = await getImagesForPage(pageNum);
            if (images && images.length > 0) {
                images.slice(0, PRELOAD_BATCH_SIZE).forEach(image => {
                    if (image.preview) { // preview property'sinin varlığını kontrol et
                        const link = document.createElement('link');
                        link.rel = 'prefetch';
                        link.as = 'image';
                        link.href = image.preview;
                        document.head.appendChild(link);
                    }
                });
            }
        }
    } catch (error) {
        console.error('Prefetch sırasında hata:', error);
    }
}
// Sayfa için resimleri getiren fonksiyon
async function getImagesForPage(pageNum) {
    try {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        let basePath;
        switch (currentPage) {
            case 'yatay.html': basePath = PATHS.HORIZONTAL; break;
            case 'kare.html': basePath = PATHS.SQUARE; break;
            default: basePath = PATHS.VERTICAL;
        }
        const imagesPerPage = PAGE_LIMITS[currentPage] || 30;
        const start = (pageNum - 1) * imagesPerPage;
        const end = start + imagesPerPage;
        // Önbellekten kontrol et
        if (cachedImages[currentPage]) {
            return cachedImages[currentPage].slice(start, end);
        }
        // Eğer önbellekte yoksa yeni request yap
        const response = await fetch(`${basePath}/images.json`);
        const data = await response.json();
        return data.images.slice(start, end);
    } catch (error) {
        console.error('Resimler alınırken hata:', error);
        return [];
    }
}
// ...existing code...
function beforeUnloadHandler(e) {
    // Eğer hakkımızda sayfasına geçiş varsa veya modal açık değilse engelleme
    const isAboutPageTransition = window.location.href.endsWith('hakkimizda.html') || 
                                 document.activeElement?.getAttribute('href') === 'hakkimizda.html';
    // İndirme işlemi devam ediyorsa veya modal açıksa uyarı göster
    const modalOpen = document.querySelector('.modal.show');
    const downloadInProgress = Date.now() - lastDownloadTime < DOWNLOAD_COOLDOWN;
    if (!isAboutPageTransition && (modalOpen || downloadInProgress)) {
        e.preventDefault();
        e.returnValue = '';
    }
}
// DOMContentLoaded event listener içinde
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    // Hakkımda linklerini yakala ve event listener'ları güncelle
    document.querySelectorAll('.nav-link:has(i.fa-info-circle)').forEach(link => {
        link.addEventListener('click', function() {
            // beforeunload event listener'ını kaldır
            window.removeEventListener('beforeunload', beforeUnloadHandler);
        });
    });
    // ...existing code...
});
// ...existing code...
document.addEventListener('DOMContentLoaded', function() {
    // Sayfa yüklendiğinde yumuşak bir şekilde en üste çık
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    // Ratio selector güncellemesi
    // Sayfa yüklendiğinde scroll kontrolü
    if (localStorage.getItem('shouldResetScroll') === 'true') {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        localStorage.removeItem('shouldResetScroll');
    }
    // displayImages fonksiyonunu güncelle
    async function displayImages(page = null) {
        const wallpaperGrid = document.getElementById('wallpapers');
        let currentImages = []; // Yerel değişken olarak tanımla
        try {
            // Loading spinner ekle
            wallpaperGrid.innerHTML = `
                <div class="loading-wrapper">
                    <div class="loading-spinner"></div>
                </div>
            `;
            // Minimum 1 saniyelik beklemeyi kaldır
            // await new Promise(resolve => setTimeout(resolve, 1000));
            // Sayfa numarasını belirle
            const savedState = loadPageState();
            currentPageNumber = page || savedState?.currentPage || 1;
            if (page) {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
            // Sayfa tipini ve base path'i belirle
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            let basePath;
            switch (currentPage) {
                case 'yatay.html': basePath = PATHS.HORIZONTAL; break;
                case 'kare.html': basePath = PATHS.SQUARE; break;
                default: basePath = PATHS.VERTICAL;
            }
            // Dosya varlığını kontrol et
            const response = await fetch(`${basePath}/images.json`);
            if (!response.ok) {
                throw new Error('images.json bulunamadı');
            }
            // Önbellekte yoksa resimleri yükle
            if (!cachedImages[currentPage]) {
                wallpaperGrid.innerHTML = '<div class="loading">Resimler yükleniyor...</div>';
                const data = await response.json();
                currentImages = data.images; // Yerel değişkene ata
                cachedImages[currentPage] = currentImages.sort();
            } else {
                currentImages = cachedImages[currentPage]; // Önbellekten al
            }
            // Sayfa tipine göre resim limitini belirle
            const imagesPerPage = PAGE_LIMITS[currentPage] || 30; // Varsayılan 30
            const start = (page - 1) * imagesPerPage;
            const end = start + imagesPerPage;
            // Grid'i temizle ve resimleri ekle
            wallpaperGrid.innerHTML = '';
            const fragment = document.createDocumentFragment();
            currentImages.slice(start, end).forEach(image => {
                const div = document.createElement('div');
                div.className = currentPage === 'yatay.html' ? 'col-landscape' : 'col-lg-2_4';
                // Resim konteyneri oluştur
                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-container';
                // Resim elementi
                const img = document.createElement('img');
                img.className = 'img-fluid lazy loading-fade';
                img.dataset.src = `${basePath}/${image.original}`;
                img.src = `${basePath}/${image.preview}`;
                img.addEventListener('click', (e) => e.preventDefault());
                img.dataset.bsToggle = 'modal';
                img.dataset.bsTarget = '#imageModal';
                img.loading = 'lazy';
                // Alt attribute'unu kaldır
                // img.alt = 'Duvar Kağıdı'; 
                // Yükleme çemberi ekle
                const spinner = document.createElement('div');
                spinner.className = 'loading-spinner';
                // Yükleme tamamlandığında
                img.onload = () => {
                    img.classList.add('loaded');
                };
                // Resim bilgi overlay'ını ekle
                const imageInfo = document.createElement('div');
                imageInfo.className = 'image-info';
                // Resim yüklendiğinde boyut ve çözünürlük bilgilerini al
                img.onload = async function() {
                    const size = await getImageSize(`${basePath}/${image.original}`);
                    const resolution = `${this.naturalWidth} x ${this.naturalHeight}px`;
                    const sizeInMB = (size / (1024 * 1024)).toFixed(2);
                    imageInfo.innerHTML = `
                        <span><i class="fas fa-image"></i> ${resolution}</span>
                        <span><i class="fas fa-weight"></i> ${sizeInMB} MB</span>
                    `;
                };
                imageContainer.appendChild(img);
                imageContainer.appendChild(imageInfo);
                div.appendChild(imageContainer);
                fragment.appendChild(div);
            });
            wallpaperGrid.appendChild(fragment);
            // Resimleri sırayla göster
            const imgs = wallpaperGrid.querySelectorAll('.img-fluid');
            imgs.forEach((img, index) => {
                setTimeout(() => {
                    img.classList.add('show');
                }, index * 100); // Her resim arasında 100ms bekle
            });
            // Intersection Observer ile lazy loading başlat
            initLazyLoading();
            // Sayfalama güncelle
            updatePagination(currentPageNumber, Math.ceil(currentImages.length / imagesPerPage));
            setupModal();
            // Her sayfa değişiminde durumu kaydet
            savePageState();
            // Prefetch sonraki sayfaların resimlerini
            prefetchImages(currentPageNumber);
        } catch (error) {
            console.error('Resimler yüklenirken hata:', error);
            wallpaperGrid.innerHTML = `
                <div class="alert alert-danger">
                    Resimler yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.
                    <br>
                    <small class="text-muted">${error.message}</small>
                </div>`;
        }
    }
    // Sayfalama tıklamalarını güncelle
    function updatePagination(currentPage, totalPages) {
        const pagination = document.querySelector('.pagination');
        const paginationItems = [];
        // Önceki sayfa butonu - sadece ilk sayfa değilse göster
        if (currentPage > 1) {
            paginationItems.push(`
                <li class="page-item">
                    <a class="page-link" href="#" data-page="${currentPage - 1}">
                        <i class="fas fa-chevron-left"></i> Önceki
                    </a>
                </li>
            `);
        }
        // Sayfa numaralarını hazırla
        let pages = [];
        if (totalPages <= 5) {
            // 5 veya daha az sayfa varsa hepsini göster
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            // 5'ten fazla sayfa varsa akıllı sayfalama yap
            if (currentPage <= 3) {
                // Başlangıç sayfalarındaysa
                pages = [1, 2, 3, 4, '...', totalPages];
            } else if (currentPage >= totalPages - 2) {
                // Son sayfalardaysa
                pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                // Ortadaki sayfalardaysa
                pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
            }
        }
        // Sayfa numaralarını ekle
        pages.forEach(page => {
            if (page === '...') {
                paginationItems.push(`
                    <li class="page-item disabled">
                        <span class="page-link">...</span>
                    </li>
                `);
            } else {
                paginationItems.push(`
                    <li class="page-item ${page === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" data-page="${page}">${page}</a>
                    </li>
                `);
            }
        });
        // Sonraki sayfa butonu - sadece son sayfa değilse göster
        if (currentPage < totalPages) {
            paginationItems.push(`
                <li class="page-item">
                    <a class="page-link" href="#" data-page="${currentPage + 1}">
                        Sonraki <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `);
        }
        pagination.innerHTML = paginationItems.join('');
        // Event listener'ları ekle
        pagination.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const pageNum = e.target.closest('.page-link').dataset.page;
                if (pageNum) {
                    const newPage = parseInt(pageNum);
                    if (!isNaN(newPage) && newPage !== currentPage) {
                        window.scrollTo({
                            top: 0,
                            behavior: 'instant'
                        });
                        currentPageNumber = newPage;
                        await displayImages(newPage);
                        savePageState();
                    }
                }
            });
        });
    }
    // ...rest of the code...
});
// ...rest of the code...
// Context menu listener'larını ekleyen fonksiyon
function setupContextMenuListeners() {
    // Modal resmi için context menu (sağ tık) listener'ı
    const modalImage = document.getElementById('modalImage');
    if (modalImage) {
        modalImage.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            handleDownload(this);
        });
    }
    // Grid'deki küçük resimler için context menu listener'ları
    document.querySelectorAll('.img-fluid').forEach(img => {
        img.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            handleDownload(this);
        });
    });
}
// ...existing code...
document.querySelector('[title="random"]').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        // Mevcut sayfadaki tüm img-fluid elementlerini seç
        const allImages = document.querySelectorAll('.img-fluid');
        if (allImages.length === 0) return;
        // Rastgele bir resim seç
        const randomIndex = Math.floor(Math.random() * allImages.length);
        const randomImage = allImages[randomIndex];
        // Modal'ı göster
        const modalImage = document.getElementById('modalImage');
        const modal = document.getElementById('imageModal');
        const modalBody = modal.querySelector('.modal-body');
        modalBody.classList.add('loading');
        modalImage.classList.remove('loaded');
        // Önemli: data-src'den HD versiyonunu al (jpg formatında)
        modalImage.src = randomImage.dataset.src; // preview yerine orijinal HD versiyonu
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        modalImage.onload = () => {
            modalBody.classList.remove('loading');
            modalImage.classList.add('loaded');
        };
    } catch (error) {
        console.error('Rastgele resim gösterilirken hata:', error);
    }
});
// ...existing code...
// ...existing code...
// ...existing code...
// Hakkımızda link event listener'ını güncelle
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    // Tüm olası Hakkımızda linklerini seç
    const aboutLinks = document.querySelectorAll('a[href="hakkimizda.html"], .nav-link:has(i.fa-info-circle), a[href="#"].nav-link:has(i.fa-info-circle), a.nav-link[href="hakkimizda.html"]');
    // Her bir linke event listener ekle
    aboutLinks.forEach(link => {
        if (link) {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                window.removeEventListener('beforeunload', beforeUnloadHandler);
                window.location.href = 'hakkimizda.html';
            });
        }
    });
    // Eski aboutLink kodunu kaldır
    // const aboutLink = document.querySelector('a[href="#"].nav-link:has(i.fa-info-circle)');
    // aboutLink.addEventListener('click', async (e) => {...});
    // ...existing code...
});
// ...existing code...
// Grid sınıflarını dinamik olarak ekle
function updateGridClasses() {
    const wallpapersGrid = document.getElementById('wallpapers');
    if (!wallpapersGrid) return;
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    // Eski sınıfları temizle
    wallpapersGrid.classList.remove('has-grid', 'has-landscape', 'has-square');
    // Sayfa tipine göre sınıf ekle
    switch (currentPage) {
        case 'index.html':
            wallpapersGrid.classList.add('has-grid');
            break;
        case 'yatay.html':
            wallpapersGrid.classList.add('has-landscape');
            break;
        case 'kare.html':
            wallpapersGrid.classList.add('has-square');
            break;
    }
    // Responsive sınıfları ekle
    wallpapersGrid.classList.add('wallpapers-grid-md', 'wallpapers-grid-sm', 'wallpapers-grid-xs', 'wallpapers-grid-xxs');
}
// DOMContentLoaded event listener'ında çağır
document.addEventListener('DOMContentLoaded', function() {
    updateGridClasses();
    // ...existing code...
});
// ...existing code...
// ...existing code...
function updateGridClasses() {
    const wallpapersGrid = document.getElementById('wallpapers');
    if (!wallpapersGrid) return;
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    // Tüm grid sınıflarını temizle
    wallpapersGrid.classList.remove('grid-vertical', 'grid-horizontal', 'grid-square');
    // Sayfa tipine göre uygun grid sınıfını ekle
    switch (currentPage) {
        case 'index.html':
            wallpapersGrid.classList.add('grid-vertical');
            break;
        case 'yatay.html':
            wallpapersGrid.classList.add('grid-horizontal');
            break;
        case 'kare.html':
            wallpapersGrid.classList.add('grid-square');
            break;
    }
}
// DOMContentLoaded event listener'ında çağır
document.addEventListener('DOMContentLoaded', function() {
    updateGridClasses();
    // ...existing code...
});
// ...existing code...
// Event delegation içindeki handleImageClick fonksiyonunu tanımla
function handleImageClick(e) {
    e.preventDefault();
    const img = e.target;
    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('imageModal');
    const modalBody = modal.querySelector('.modal-body');
    const closeBtn = modal.querySelector('.modal-close-btn');
    modalBody.classList.add('loading');
    modalImage.classList.remove('loaded');
    closeBtn.classList.remove('show'); // Yükleme başladığında butonu gizle
    // Önce düşük kaliteli resmi göster
    modalImage.src = img.src;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    // HD resmi arka planda yükle
    if (img.dataset.src) {
        loadHighQualityImage(modalImage, img.dataset.src, true)
            .then(() => {
                modalBody.classList.remove('loading');
                modalImage.classList.add('loaded');
                closeBtn.classList.add('show'); // Resim yüklendiğinde butonu göster
                savePageState();
            })
            .catch(error => {
                console.error('HD resim yüklenemedi:', error);
                modalBody.classList.remove('loading');
                closeBtn.classList.add('show'); // Hata durumunda da butonu göster
            });
    }
}
// handleRandomClick fonksiyonunu ekle
async function handleRandomClick(e) {
    e.preventDefault();
    try {
        // Mevcut sayfadaki tüm resimleri seç
        const allImages = document.querySelectorAll('.img-fluid');
        if (allImages.length === 0) return;
        // Rastgele bir resim seç
        const randomIndex = Math.floor(Math.random() * allImages.length);
        const randomImage = allImages[randomIndex];
        // Modal'ı göster
        const modalImage = document.getElementById('modalImage');
        const modal = document.getElementById('imageModal');
        const modalBody = modal.querySelector('.modal-body');
        modalBody.classList.add('loading');
        modalImage.classList.remove('loaded');
        // HD versiyonu kullan
        modalImage.src = randomImage.dataset.src;
        const modalInstance = new bootstrap.Modal(modal);
        // Modal kapanma olayını dinle
        modal.addEventListener('hidden.bs.modal', function handleHidden() {
            // Event listener'ı kaldır
            modal.removeEventListener('hidden.bs.modal', handleHidden);
            // Modal ve backdrop elementlerini temizle
            modalInstance.dispose();
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
            // Body class'larını temizle
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }, { once: true });
        modalInstance.show();
        modalImage.onload = () => {
            modalBody.classList.remove('loading');
            modalImage.classList.add('loaded');
            savePageState();
        };
    } catch (error) {
        console.error('Rastgele resim gösterilirken hata:', error);
    }
}
// Event delegation kodunu güncelle
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements
    // Event delegation for better performance
    document.body.addEventListener('click', function(e) {
        if (e.target.matches('.img-fluid')) {
            handleImageClick(e);
        } else if (e.target.matches('[title="random"]')) {
            handleRandomClick(e);
        }
    });
    // ...rest of the code...
});
// ...rest of the code...
// Scroll işlemi için will-change optimizasyonu
function optimizeScrollPerformance() {
    let scrollTimeout;
    const scrollProgress = document.querySelector('.scroll-progress');
    window.addEventListener('scroll', () => {
        const totalScroll = document.documentElement.scrollTop;
        const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scroll = `${totalScroll / windowHeight}`;
        scrollProgress.style.transform = `scaleX(${scroll})`;
        scrollProgress.style.opacity = scroll;
    });
    window.addEventListener('scroll', () => {
        if (!scrollProgress.style.willChange) {
            scrollProgress.style.willChange = 'transform';
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            scrollProgress.style.willChange = 'auto';
        }, 150); // Scroll bittikten 150ms sonra will-change'i kaldır
    }, { passive: true });
}
// Modal zoom işlemi için will-change optimizasyonu
function handleZoom() {
    if (!isZooming) return;
    const modalImage = document.getElementById('modalImage');
    if (!modalImage.style.willChange) {
        modalImage.style.willChange = 'transform';
    }
    // ...existing zoom logic...
}
function stopZooming() {
    const modalImage = document.getElementById('modalImage');
    modalImage.style.willChange = 'auto';
    isZooming = false;
    modalBody.classList.remove('zooming');
    modalImage.classList.remove('zoom-mode');
    modalImage.style.transform = '';
    zoomLens.classList.remove('active');
}
// DOM yüklendiğinde optimizasyonları başlat
document.addEventListener('DOMContentLoaded', function() {
    optimizeScrollPerformance();
    // ...existing code...
});
// ...existing code...
// Scroll progress fonksiyonunu optimize et
function updateScrollProgress() {
    const scrollProgress = document.querySelector('.scroll-progress');
    if (!scrollProgress) return;
    // Scroll yüzdesini hesapla
    const docElement = document.documentElement;
    const scrollPercent = docElement.scrollTop / 
        (docElement.scrollHeight - docElement.clientHeight);
    // CSS Custom Property kullanarak güncelle
    scrollProgress.style.setProperty('--scroll-progress', scrollPercent);
}
// Scroll event listener'ı optimize et
document.addEventListener('DOMContentLoaded', function() {
    let scrollTimeout;
    let ticking = false;
    // Passive scroll listener ekle
    window.addEventListener('scroll', () => {
        if (!ticking) {
            // requestAnimationFrame kullan
            window.requestAnimationFrame(() => {
                updateScrollProgress();
                ticking = false;
            });
            ticking = true;
        }
        // Throttle scroll event
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            // Son scroll pozisyonunu güncelle
            updateScrollProgress();
        }, 16.67); // 60fps için ~16.67ms 
    }, { passive: true }); // Passive event listener
    // İlk yüklemede progress'i ayarla
    updateScrollProgress();
});
// ...existing code...
// ...existing code...
// Mobil zoom kontrollerini ekle
function setupMobileZoom() {
    const modalBody = document.querySelector('.modal-body');
    const modalImage = document.getElementById('modalImage');
    const zoomRange = document.getElementById('zoomRange');
    const zoomPercentage = document.querySelector('.zoom-percentage');
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let currentScale = 1;
    let isDragging = false;
    let lastTapTime = 0;
    // Zoom slider kontrolü
    zoomRange.addEventListener('input', (e) => {
        const zoomValue = 1 + e.target.value / 100;
        currentScale = zoomValue;
        updateImageTransform();
        // Yüzde değerini güncelle
        zoomPercentage.textContent = `%${e.target.value}`;
    });
    // Dokunma başlangıcı
    modalImage.addEventListener('touchstart', (e) => {
        // Mevcut zamanı al
        const tapTime = new Date().getTime();
        const timeDiff = tapTime - lastTapTime;
        // Eğer çift tıklama varsa (300ms içinde)
        if (timeDiff < 300 && timeDiff > 0) {
            // Zoom değerini değiştir
            currentScale = currentScale === 1 ? 1.5 : 1;
            zoomRange.value = (currentScale - 1) * 100;
            zoomPercentage.textContent = `%${zoomRange.value}`;
            updateImageTransform();
        }
        lastTapTime = tapTime;
        // Her durumda sürüklemeyi başlat
        isDragging = true;
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
        modalBody.classList.add('mobile-zoom-active', 'touch-dragging');
    });
    // Dokunma ile sürükleme
    modalImage.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const newX = e.touches[0].clientX - startX;
        const newY = e.touches[0].clientY - startY;
        // Sürükleme sınırlarını hesapla
        const maxX = modalImage.width * (currentScale - 1) / 2;
        const maxY = modalImage.height * (currentScale - 1) / 2;
        // Sınırlar içinde hareket ettir
        translateX = Math.min(Math.max(newX, -maxX), maxX);
        translateY = Math.min(Math.max(newY, -maxY), maxY);
        updateImageTransform();
    });
    // Dokunma bitişi
    modalImage.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            modalBody.classList.remove('mobile-zoom-active', 'touch-dragging');
            // Eğer zoom seviyesi 1 ise pozisyonu sıfırla
            if (currentScale === 1) {
                translateX = 0;
                translateY = 0;
                updateImageTransform();
            }
        }
    });
    // Transform güncelleme fonksiyonu
    function updateImageTransform() {
        modalImage.style.transform = `scale(${currentScale}) translate(${translateX}px, ${translateY}px)`;
    }
    // Modal kapandığında resetle
    document.getElementById('imageModal').addEventListener('hidden.bs.modal', () => {
        zoomRange.value = 0;
        zoomPercentage.textContent = '%0';
        currentScale = 1;
        translateX = 0;
        translateY = 0;
        updateImageTransform();
    });
}
// DOMContentLoaded event listener içinde çağır
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    setupMobileZoom();
    // ...existing code...
});
// Reklam engelleyici tespiti ve mesaj yönetimi
function checkAdBlocker() {
    // Test div oluştur - reklam sınıfı ile
    const testAd = document.createElement('div');
    testAd.innerHTML = '&nbsp;';
    testAd.className = 'adsbox';
    document.body.appendChild(testAd);
    // Reklam engelleyici tespiti için timeout
    setTimeout(() => {
        const adblockWarning = document.querySelector('.adblock-warning');
        // Reklam engelleyici testi - offsetHeight 0 ise engelleyici var demektir
        const isAdBlockerActive = testAd.offsetHeight === 0;
        testAd.remove();
        if (adblockWarning) {
            adblockWarning.style.display = 'flex';
            setTimeout(() => {
                adblockWarning.classList.add('show');
                if (isAdBlockerActive) {
                    // Reklam engelleyici varsa uyarı mesajı
                    adblockWarning.classList.add('adblock-detected');
                    adblockWarning.innerHTML = `
                        <i class="fas fa-exclamation-triangle"></i>
                        <p><strong>Dikkat!</strong> Reklam engelleyici tespit edildi! Sitemizi desteklemek ve tüm özellikleri kullanabilmek için lütfen reklam engelleyicinizi devre dışı bırakın.</p>
                    `;
                    // 20 saniye göster
                    setTimeout(() => {
                        adblockWarning.classList.add('hide');
                        adblockWarning.classList.remove('show');
                        setTimeout(() => {
                            adblockWarning.style.display = 'none';
                        }, 500);
                    }, 20000);
                } else {
                    // Reklam engelleyici yoksa teşekkür mesajı
                    adblockWarning.innerHTML = `
                        <i class="fas fa-info-circle"></i>
                        <p>Sitemizi desteklemek ve sorunlarla karşılaşmamak için reklam engelleyici kullanmamanızı öneririz. Teşekkür ederiz!</p>
                    `;
                    // 5 saniye göster
                    setTimeout(() => {
                        adblockWarning.classList.add('hide');
                        adblockWarning.classList.remove('show');
                        setTimeout(() => {
                            adblockWarning.style.display = 'none';
                        }, 500);
                    }, 10000);
                }
            }, 100);
        }
    }, 100);
}
// DOMContentLoaded event listener içinde çağır
document.addEventListener('DOMContentLoaded', function() {
    checkAdBlocker();
    // ...existing code...
});
// ...existing code...
// İndirme bilgisi mesajını cihaz tipine göre güncelle
function updateDownloadInfo() {
    const downloadInfo = document.querySelector('.download-info');
    if (!downloadInfo) return;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        downloadInfo.innerHTML = `
            <i class="fas fa-hand-pointer"></i>
            Büyülü Duvar Kağıtlarını indirmek için basılı tutun! (Her 15 saniyede bir indirme yapabilirsiniz)
        `;
    } else {
        downloadInfo.innerHTML = `
            <i class="fas fa-mouse"></i>
            Büyülü Duvar Kağıtlarını indirmek için sağ tık yapın! (Her 15 saniyede bir indirme yapabilirsiniz)
        `;
    }
}
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    updateDownloadInfo(); // Mesajı güncelle
    // ...existing code...
});
// Sayfa yüklenirken ve ekran boyutu değiştiğinde kontrol et
window.addEventListener('resize', updateDownloadInfo);
// ...existing code...
// Performans için debounce fonksiyonu
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// Navbar scroll kontrolü
function handleNavbarScroll() {
    const navbar = document.querySelector('.custom-navbar');
    const scrolled = window.scrollY > 50;
    requestAnimationFrame(() => {
        if (scrolled) {
            navbar.classList.add('scrolled');
            // Floating efektini artır
            navbar.style.transform = 'translateX(-50%) translateY(5px)';
        } else {
            navbar.classList.remove('scrolled');
            // Normal pozisyona döndür
            navbar.style.transform = 'translateX(-50%)';
        }
    });
}
// Scroll event listener'ı optimize edilmiş şekilde ekle
document.addEventListener('DOMContentLoaded', function() {
    // Mevcut scroll pozisyonunu kontrol et
    handleNavbarScroll();
    // Scroll event'i için debounce kullan
    window.addEventListener('scroll', debounce(() => {
        handleNavbarScroll();
    }, 10), { passive: true });
    // ...existing code...
});
// ...existing code...
// Kategori toggle fonksiyonunu kaldır veya devre dışı bırak
function initCategoryToggle() {
    const categoryToggle = document.querySelector('.category-toggle');
    const sidebar = document.querySelector('.sidebar');
    // Mobil cihazlar için tıklama olayını koru
    if (window.innerWidth <= 768) {
        categoryToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            categoryToggle.classList.toggle('active');
        });
    }
}
// ...existing code...
// Animasyon kontrolü için fonksiyon ekle
function initAnimationToggle() {
    const toggleBtn = document.getElementById('animationToggle');
    const body = document.body;
    // localStorage'dan son durumu al
    const animationsDisabled = localStorage.getItem('animationsDisabled') === 'true';
    if (animationsDisabled) {
        body.classList.add('no-animations');
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Animasyonları Aç';
        // Welcome title ve download info elementlerini seç
        const welcomeTitle = document.querySelector('.welcome-title');
        const downloadInfo = document.querySelector('.download-info');
        // Varsa bu elementlerin animasyonlarını kaldır
        if (welcomeTitle) {
            welcomeTitle.style.animation = 'none';
            welcomeTitle.style.opacity = '1';
        }
        if (downloadInfo) {
            downloadInfo.style.animation = 'none';
            downloadInfo.style.opacity = '1';
            downloadInfo.style.transform = 'none';
        }
    }
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        body.classList.toggle('no-animations');
        toggleBtn.classList.toggle('active');
        const isDisabled = body.classList.contains('no-animations');
        localStorage.setItem('animationsDisabled', isDisabled);
        // Buton metnini ve ikonunu güncelle
        if (isDisabled) {
            toggleBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Animasyonları Aç';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-play-circle"></i> Animasyonları Kapat';
        }
    });
}
// DOMContentLoaded event listener'ına ekle
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    initAnimationToggle();
    // ... existing code ...
});
// Resim boyutunu almak için yardımcı fonksiyon
async function getImageSize(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const size = response.headers.get('content-length');
        return parseInt(size, 10);
    } catch (error) {
        console.error('Resim boyutu alınamadı:', error);
        return 0;
    }
}
// Page transition state
const PAGE_TRANSITION = {
    isTransitioning: false,
    pendingPage: null,
    cooldownTime: 1000
};
// Cached DOM elements
const DOM = {
    ratioButtons: null,
    wallpaperGrid: null
};
// Initialize DOM cache
function cacheDOMElements() {
    DOM.ratioButtons = document.querySelectorAll('.ratio-btn');
    DOM.wallpaperGrid = document.getElementById('wallpapers');
}
// Ratio selector initialization with optimizations
function initRatioSelector() {
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            const targetPage = this.getAttribute('href');
            if (!targetPage) return;
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            if (targetPage === currentPage) return;
            // Direk sayfa geçişi yap
            window.location.href = targetPage;
        });
    });
}
// Helper function for confirmation dialogs
function showConfirmationDialog(message) {
    return new Promise(resolve => {
        // Use custom modal if available, otherwise use confirm
        const shouldProceed = confirm(message);
        resolve(shouldProceed);
    });
}
// Helper function for error messages
function showErrorMessage(message) {
    // You can implement a custom toast/notification system here
    console.error(message);
}
// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements first
    cacheDOMElements();
    // Then initialize features
    initRatioSelector();
    // ...existing code...
});
// Add a cleanup function for page transitions
window.addEventListener('beforeunload', () => {
    if (PAGE_TRANSITION.isTransitioning) {
        // Clean up any pending transitions
        PAGE_TRANSITION.isTransitioning = false;
        PAGE_TRANSITION.pendingPage = null;
    }
});
// ...existing code...
// Rastgele buton animasyonu için değişkenler
let isRandomizing = false;
let randomizeInterval;
let currentSpeed = 5; // Başlangıç hızı (ms)
const maxSpeed = 400; // En yavaş hız (ms)
const speedIncrement = 10; // Her adımda hızı ne kadar yavaşlatacağız
// Rastgele butonu için güncellenmiş event listener
document.querySelector('[title="random"]').addEventListener('click', async function(e) {
    e.preventDefault();
    if (isRandomizing) return;
    const allImages = document.querySelectorAll('.img-fluid');
    if (allImages.length === 0) return;
    // Modal'ı aç
    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('imageModal');
    const modalBody = modal.querySelector('.modal-body');
    modalBody.classList.add('loading');
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    // Rastgele resim gösterme animasyonunu başlat
    isRandomizing = true;
    currentSpeed = 50;
    let lastIndex = -1;
    // Animasyon fonksiyonu
    const animateRandomImage = () => {
        // Farklı bir rastgele index seç
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * allImages.length);
        } while (randomIndex === lastIndex);
        lastIndex = randomIndex;
        // Resmi göster
        modalImage.src = allImages[randomIndex].src;
        modalImage.classList.remove('loaded');
        void modalImage.offsetWidth; // Reflow tetikle
        modalImage.classList.add('loaded');
        currentSpeed += speedIncrement;
        // Animasyonu devam ettir veya durdur
        if (currentSpeed < maxSpeed) {
            setTimeout(animateRandomImage, currentSpeed);
        } else {
            // Animasyonu bitir
            isRandomizing = false;
            modalBody.classList.remove('loading');
            // Son seçilen resmin HD versiyonunu yükle
            const finalImage = allImages[lastIndex];
            if (finalImage.dataset.src) {
                modalImage.src = finalImage.dataset.src;
            }
            // Zafer efekti
            showVictoryEffect(modalBody);
        }
    };
    // Animasyonu başlat
    animateRandomImage();
});
// Zafer efekti fonksiyonu
function showVictoryEffect(modalBody) {
    const confettiContainer = document.createElement('div');
    confettiContainer.className = 'confetti-container';
    modalBody.appendChild(confettiContainer);
    // Her biri farklı renk ve animasyon zamanlamasına sahip 50 konfeti
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.setProperty('--delay', `${Math.random() * 5}s`);
        confetti.style.setProperty('--rotation', `${Math.random() * 360}deg`);
        confetti.style.left = `${Math.random() * 100}%`;
        // Rastgele canlı renkler
        const hue = Math.random() * 360;
        const saturation = 50 + Math.random() * 50; // %50-%100 arası
        const lightness = 50 + Math.random() * 20; // %50-%70 arası
        confetti.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        confettiContainer.appendChild(confetti);
    }
    // 3 saniye sonra efekti temizle
    setTimeout(() => {
        confettiContainer.style.opacity = '0';
        setTimeout(() => confettiContainer.remove(), 300);
    }, 3000);
}
// ...existing code...
// Yeni bir asenkron yardımcı fonksiyon ekle
async function loadHighQualityImage(modalImage, hdUrl) {
    return new Promise((resolve, reject) => {
        const hdImage = new Image();
        hdImage.onload = () => {
            modalImage.src = hdUrl;
            modalImage.classList.add('loaded');
            resolve();
        };
        hdImage.onerror = reject;
        hdImage.src = hdUrl;
    });
}
// Event delegation içindeki handleImageClick fonksiyonunu güncelle
function handleImageClick(e) {
    e.preventDefault();
    const img = e.target;
    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('imageModal');
    const modalBody = modal.querySelector('.modal-body');
    const closeBtn = modal.querySelector('.modal-close-btn');
    modalBody.classList.add('loading');
    modalImage.classList.remove('loaded');
    closeBtn.classList.remove('show'); // Yükleme başladığında butonu gizle
    // Önce düşük kaliteli resmi göster
    modalImage.src = img.src;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    // HD resmi arka planda yükle
    if (img.dataset.src) {
        loadHighQualityImage(modalImage, img.dataset.src, true)
            .then(() => {
                modalBody.classList.remove('loading');
                modalImage.classList.add('loaded');
                closeBtn.classList.add('show'); // Resim yüklendiğinde butonu göster
                savePageState();
            })
            .catch(error => {
                console.error('HD resim yüklenemedi:', error);
                modalBody.classList.remove('loading');
                closeBtn.classList.add('show'); // Hata durumunda da butonu göster
            });
    }
}
// ...existing code...
function setupModal() {
    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('imageModal');
    const modalBody = modal.querySelector('.modal-body');
    let isZooming = false;
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let currentScale = 1;
    let lastClickTime = 0;
    // Transform güncelleme fonksiyonu - animasyon parametresi eklendi
    function updateImageTransform(withAnimation = false) {
        if (withAnimation) {
            modalImage.style.transition = 'transform 0.3s ease-out';
            setTimeout(() => {
                modalImage.style.transition = 'none';
            }, 300);
        } else {
            modalImage.style.transition = 'none';
        }
        modalImage.style.transform = `scale(${currentScale}) translate(${translateX}px, ${translateY}px)`;
    }
    // Resmi ortala fonksiyonu
    function centerImage(withAnimation = true) {
        translateX = 0;
        translateY = 0;
        currentScale = 1;
        updateImageTransform(withAnimation);
    }
    // Resmi büyüt fonksiyonu
    function zoomImage(withAnimation = true) {
        translateX = 0;
        translateY = 0;
        currentScale = 2; // İstediğiniz zoom seviyesi
        updateImageTransform(withAnimation);
    }
    // Çift tıklama olayı
    modalImage.addEventListener('click', () => {
        const clickTime = Date.now();
        // Çift tıklama kontrolü (300ms içinde)
        if (clickTime - lastClickTime < 300) {
            // Eğer resim zaten büyütülmüşse küçült, değilse büyüt
            if (currentScale > 1) {
                centerImage(true);
            } else {
                zoomImage(true);
            }
        }
        lastClickTime = clickTime;
    });
    // Mouse hareketi takibi
    document.addEventListener('mousemove', (e) => {
        if (!isZooming) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateImageTransform(false);
    });
    // Mouse tuşu bırakıldığında
    document.addEventListener('mouseup', () => {
        if (isZooming) {
            isZooming = false;
            modalBody.classList.remove('zooming');
            modalImage.classList.remove('zoom-mode');
            centerImage(true);
        }
    });
    // Mouse tuşuna basıldığında
    modalImage.addEventListener('mousedown', (e) => {
        // Çift tıklama değilse sürüklemeye başla
        if (Date.now() - lastClickTime > 300) {
            isZooming = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            modalBody.classList.add('zooming');
            modalImage.classList.add('zoom-mode');
        }
    });
    // Tekerlek ile zoom
    modalImage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
        currentScale = Math.min(Math.max(currentScale * scaleAmount, 1), 3);
        updateImageTransform();
    });
    // Modal olayları
    modal.addEventListener('shown.bs.modal', () => {
        savePageState();
    });
    modal.addEventListener('hide.bs.modal', () => {
        isZooming = false;
        modalBody.classList.remove('zooming');
        modalImage.classList.remove('zoom-mode');
        modalImage.style.transform = '';
        translateX = 0;
        translateY = 0;
        currentScale = 1;
    });
    // ESC tuşu kontrolü
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            modalInstance.hide();
        }
    });
    // Dışarı tıklama ile kapatmayı devre dışı bırak
    modal.addEventListener('click', (e) => {
        if (e.target === modal && !isZooming) {
            e.stopPropagation();
        }
    });
    // İndirme olayı için context menu (sağ tık) listener'ı ekle
    modalImage.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        handleDownload(this);
    });
    // Grid'deki küçük resimler için de aynı özelliği ekle
    document.querySelectorAll('.img-fluid').forEach(img => {
        img.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            handleDownload(this);
        });
    });
    // Kapatma butonu oluştur
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    modalBody.appendChild(closeBtn); // Butonu modalBody'e ekle
    // Kapatma butonu click olayı
    closeBtn.addEventListener('click', () => {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
            // Modal kapandıktan sonra temizlik yap
            setTimeout(() => {
                modalImage.style.transform = '';
                translateX = 0;
                translateY = 0;
                currentScale = 1;
                isZooming = false;
                modalBody.classList.remove('zooming');
                modalImage.classList.remove('zoom-mode');
                // Backdrop'u temizle
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) backdrop.remove();
                // Body class'larını temizle
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }, 300);
        }
    });
    // Modal hidden event'i
    modal.addEventListener('hidden.bs.modal', () => {
        modalImage.style.transform = '';
        translateX = 0;
        translateY = 0;
        currentScale = 1;
        isZooming = false;
        modalBody.classList.remove('zooming');
        modalImage.classList.remove('zoom-mode');
        // Backdrop'u temizle
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        // Body class'larını temizle
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    });
    // Mouse/touch olaylarında buton görünürlüğünü kontrol et
    let buttonTimeout;
    function showCloseButton() {
        closeBtn.style.opacity = '1';
        closeBtn.style.pointerEvents = 'auto';
    }
    function hideCloseButton() {
        closeBtn.style.opacity = '0';
        closeBtn.style.pointerEvents = 'none';
    }
    function resetButtonVisibility() {
        clearTimeout(buttonTimeout);
        buttonTimeout = setTimeout(showCloseButton, 300);
    }
    // Mouse/touch hareketi dinleyicileri
    modalBody.addEventListener('mousemove', resetButtonVisibility);
    modalBody.addEventListener('touchstart', resetButtonVisibility);
    modalBody.addEventListener('touchend', resetButtonVisibility);
    // Zoom durumunda butonu gizle
    document.addEventListener('mousemove', () => {
        if (isZooming) {
            hideCloseButton();
        }
    });
    // Zoom bittiğinde butonu göster
    document.addEventListener('mouseup', () => {
        if (isZooming) {
            resetButtonVisibility();
        }
    });
    // Resim yüklendiğinde butonu göster
    modalImage.addEventListener('load', () => {
        if (modalImage.classList.contains('loaded')) {
            closeBtn.classList.add('show');
        }
    });
    // Modal kapanırken butonu gizle
    modal.addEventListener('hide.bs.modal', () => {
        closeBtn.classList.remove('show');
    });
}
// ...existing code...

// Scroll progress için global değişken ekle
let scrollProgressBar = null;

// Scroll progress elementini kontrol et ve cache'le
function initScrollProgress() {
    scrollProgressBar = document.querySelector('.scroll-progress');
    if (!scrollProgressBar) {
        // Eğer element yoksa oluştur
        scrollProgressBar = document.createElement('div');
        scrollProgressBar.className = 'scroll-progress';
        document.body.prepend(scrollProgressBar);
    }
    return true;
}

// Scroll progress güncelleme fonksiyonu
function updateScrollProgress() {
    if (!scrollProgressBar) {
        if (!initScrollProgress()) return;
    }
    
    const docElement = document.documentElement;
    const windowHeight = docElement.scrollHeight - docElement.clientHeight;
    
    if (windowHeight <= 0) return;
    
    const scrolled = (docElement.scrollTop / windowHeight);
    scrollProgressBar.style.transform = `scaleX(${scrolled})`;
    scrollProgressBar.style.opacity = scrolled;
}

// Throttle fonksiyonu
function throttle(func, _limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            requestAnimationFrame(() => {
                inThrottle = false;
            });
        }
    }
}

// optimizeScrollPerformance fonksiyonunu güncelle
function optimizeScrollPerformance() {
    
    if (!scrollProgressBar) {
        initScrollProgress();
    }
    
    const throttledUpdate = throttle(() => {
        updateScrollProgress();
    }, 16.67); // ~60fps

    window.addEventListener('scroll', throttledUpdate, { passive: true });
}

// DOMContentLoaded event listener'ını güncelle
document.addEventListener('DOMContentLoaded', function() {
    // Scroll progress elementini initialize et ve event listener'ları ekle
    initScrollProgress();
    optimizeScrollPerformance();
    
    // İlk yüklemede progress'i ayarla
    updateScrollProgress();

    // ...existing code...
});

// ...existing code...

// Scroll optimizasyonu için yardımcı fonksiyonlar
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Scroll event listener'ları optimize et
document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.querySelector('.custom-navbar');
    const sidebar = document.querySelector('.sidebar');
    
    // Scroll handler'ı debounce ile optimize et
    const handleScroll = debounce(() => {
        requestAnimationFrame(() => {
            const scrolled = window.scrollY > 50;
            if (scrolled) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }, 10);

    // Passive scroll listener ekle
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Touch olayları için momentum scroll
    if (sidebar) {
        sidebar.addEventListener('touchstart', () => {}, { passive: true });
        sidebar.addEventListener('touchmove', () => {}, { passive: true });
    }
});

// ...existing code...