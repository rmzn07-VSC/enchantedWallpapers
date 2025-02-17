newFunction();
function newFunction() {
    document.addEventListener('DOMContentLoaded', function () {
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
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                // Text'i güncelle
                themeText.textContent =
                    newTheme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
            });
        }
        // Geri dönüş butonu işlevi
        const backButton = document.querySelector('.back-to-wallpapers');
        if (backButton) {
            backButton.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }
        // Navbar dışı tıklamaları dinle ve menüyü kapat
        const navbar = document.querySelector('.navbar');
        const navbarCollapse = document.querySelector('.navbar-collapse');
        document.addEventListener('click', function (e) {
            // Eğer navbar açıksa ve tıklanan element navbar'ın dışındaysa
            if (navbarCollapse.classList.contains('show') &&
                !navbar.contains(e.target) &&
                !e.target.classList.contains('navbar-toggler')) {
                // Bootstrap'in collapse metodunu kullanarak menüyü kapat
                bootstrap.Collapse.getInstance(navbarCollapse).hide();
            }
        });
        // Animasyon kontrolü için fonksiyon ekle
        function initAnimationToggle() {
            const toggleBtn = document.getElementById('animationToggle');
            const body = document.body;
            // localStorage'dan son durumu al
            const animationsDisabled = localStorage.getItem('animationsDisabled') === 'true';
            // Animasyon durumunu ayarla
            function toggleAnimations(disabled) {
                const animatedElements = document.querySelectorAll('.about-card, .stat-card, .team-card, .about-icon i, .dev-links .social-link');
                if (disabled) {
                    body.classList.add('no-animations');
                    toggleBtn.classList.add('active');
                    toggleBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Animasyonları Aç';
                    animatedElements.forEach(el => {
                        el.style.animation = 'none';
                        el.style.transform = 'none';
                        el.style.transition = 'none';
                    });
                } else {
                    body.classList.remove('no-animations');
                    toggleBtn.classList.remove('active');
                    toggleBtn.innerHTML = '<i class="fas fa-play-circle"></i> Animasyonları Kapat';
                    animatedElements.forEach(el => {
                        el.style.animation = '';
                        el.style.transform = '';
                        el.style.transition = '';
                    });
                    // Animasyonları yeniden başlat
                    animatedElements.forEach(el => {
                        el.style.animationName = 'none';
                        void el.offsetWidth; // Reflow tetikle
                        el.style.animationName = '';
                    });
                }
            }
            // Başlangıç durumunu ayarla
            toggleAnimations(animationsDisabled);
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const isDisabled = !body.classList.contains('no-animations');
                    localStorage.setItem('animationsDisabled', isDisabled);
                    toggleAnimations(isDisabled);
                });
            }
        }
        // Fonksiyonları başlat
        initThemeToggle();
        initAnimationToggle();
    });
}
