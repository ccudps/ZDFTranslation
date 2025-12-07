document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Scroll Animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // How It Works - Interactive Tabs
    const steps = document.querySelectorAll('.step-item');
    const images = document.querySelectorAll('.step-content');

    if (steps.length > 0) {
        steps.forEach((step, index) => {
            step.addEventListener('click', () => {
                // Remove active class from all
                steps.forEach(s => s.classList.remove('active'));
                images.forEach(img => img.classList.remove('active'));

                // Add active class to clicked
                step.classList.add('active');

                // Show corresponding image
                if (images[index]) {
                    images[index].classList.add('active');
                }
            });
        });
    }


    /* -------------------------------------------------------------------------- */
    /*                               SHOWS FILTER                                 */
    /* -------------------------------------------------------------------------- */

    // DATA: Brand-aligned Show Data
    const showsData = [
        {
            title: "ZDF Magazin Royale",
            description: "Satirical late-night show covering politics and culture with wit.",
            image: "assets/ShowLogos/ZDF_Magazin_Logo_2022.png",
            genre: ["comedy", "news"],
            level: "c1",
        },
        {
            title: "Tatort",
            description: "The classic German crime series. A cultural institution every Sunday.",
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/ARD_Tatort_Logo_weiss.svg/1200px-ARD_Tatort_Logo_weiss.svg.png",
            genre: ["crime"],
            level: "b2",

        },
        {
            title: "Babylon Berlin",
            description: "A neo-noir police drama set in Berlin during the roaring twenties.",
            image: "https://d1nslcd7m2225b.cloudfront.net/Pictures/1024x536/9/3/8/1258938_babylonberliniv_sky_107775.jpg",
            genre: ["history", "crime"],
            level: "c1",
        },
        {
            title: "Dark",
            description: "A family saga with a supernatural twist. Mind-bending mystery.",
            image: "https://m.media-amazon.com/images/M/MV5BMjA4NzUyMzY2NV5BMl5BanBnXkFtZTgwNzMzMjMzNzM@._V1_FMjpg_UX1000_.jpg",
            genre: ["crime", "docu"],
            level: "b2",
        },
        {
            title: "Tagesschau",
            description: "Germany's most trusted news program. Clear articulation.",
            image: "https://images.tagesschau.de/image/48902500-1b22-4414-b03a-025555621404/AAABj0s57oM/AAABjwnlXhk/original/tagesschau-logo-100.jpg",
            genre: ["news"],
            level: "b1",
        },
        {
            title: "Die Maus",
            description: "Educational children's series explaining how everyday things work.",
            image: "https://upload.wikimedia.org/wikipedia/commons/e/e4/Maus_Logo_2022.svg",
            genre: ["kids", "docu"],
            level: "a2",
        },
        {
            title: "Terra X",
            description: "High-quality documentaries about history, nature, and science.",
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Terra_X_Logo_2024.svg/2560px-Terra_X_Logo_2024.svg.png",
            genre: ["docu", "history"],
            level: "b2",
        },
        {
            title: "Heute Show",
            description: "Satirical news show commenting on current political events.",
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/ZDF_heute-show_Logo_2021.svg/1200px-ZDF_heute-show_Logo_2021.svg.png",
            genre: ["comedy", "news"],
            level: "c1",
        }
    ];

    const grid = document.getElementById('shows-grid');
    const noResults = document.getElementById('no-results');
    const genreLabel = document.getElementById('genre-label');
    const levelLabel = document.getElementById('level-label');

    let activeGenres = new Set(['all']);
    let activeLevels = new Set(['all']);

    // Render Function
    function renderShows() {
        if (!grid) return;

        grid.innerHTML = '';

        const filtered = showsData.filter(show => {
            // Genre Logic: If 'all' is selected -> match. OR if show has ANY of the selected genres.
            // Note: show.genre is an array. WE need to check if ANY of show.genre is in activeGenres.
            const genreMatch = activeGenres.has('all') || show.genre.some(g => activeGenres.has(g));

            // Level Logic: If 'all' is selected -> match. OR if show.level is in activeLevels.
            const levelMatch = activeLevels.has('all') || activeLevels.has(show.level);

            return genreMatch && levelMatch;
        });

        if (filtered.length === 0) {
            noResults.classList.remove('hidden');
        } else {
            noResults.classList.add('hidden');
            filtered.forEach((show) => {
                // ... (Card creation code remains the same, assuming it's inside this block)
                const card = document.createElement('article');
                const bgClass = 'bg-white';
                const textClass = 'text-[var(--color-brand-dark)]';
                const buttonClass = 'bg-[var(--color-brand-dark)] text-white hover:bg-[var(--color-brand-dark)]/90';

                // Carousel optimized classes
                card.className = `relative flex-none w-[85vw] sm:w-[350px] md:w-[400px] snap-center sm:snap-start overflow-hidden sm:rounded-3xl min-h-[380px] sm:min-h-[440px] md:min-h-[500px] sm:p-6 md:p-7 flex flex-col ${textClass} ${bgClass} border-zinc-900/5 border rounded-2xl p-5 shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl`;

                card.innerHTML = `
                    <div class="flex items-center justify-end opacity-90">
                        <span class="text-1xl sm:text-2xl font-semibold tracking-tight text-[var(--color-brand-orange)]">${show.level.toUpperCase()}</span>
                    </div>
                    
                    <h3 class="mt-4 sm:mt-5 text-2xl sm:text-3xl tracking-tight font-semibold">${show.title}</h3>
                    <p class="mt-2 text-sm sm:text-base opacity-90 line-clamp-3">
                        ${show.description}
                    </p>
                    
                    <div class="mt-5 sm:mt-6 rounded-xl sm:rounded-2xl overflow-hidden bg-black/5 ring-1 ring-black/5 h-44 sm:h-56 md:h-[300px] flex items-center justify-center p-6">
                        <img src="${show.image}" alt="${show.title}" class="w-full h-full object-contain drop-shadow-md">
                    </div>
                    
                    <div class="mt-auto pt-6 flex items-center justify-end">
                       <a href="https://www.ardmediathek.de/suche/${show.title}" target="_blank" class="inline-flex items-center gap-2 ${buttonClass} px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl">
                            Watch now
                            <i data-lucide="play-circle" class="w-4 h-4 fill-current"></i>
                       </a>
                    </div>
                `;
                grid.appendChild(card);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // Filter Logic
    const genreButtons = document.querySelectorAll('button[data-type="genre"]');
    const levelButtons = document.querySelectorAll('button[data-type="level"]');

    function updateFilters(buttons, type) {
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.value;
                const activeSet = type === 'genre' ? activeGenres : activeLevels;

                if (val === 'all') {
                    // Selecting 'All' clears everything else and selects 'All'
                    activeSet.clear();
                    activeSet.add('all');
                } else {
                    // Selecting a specific filter
                    if (activeSet.has('all')) {
                        activeSet.clear(); // Remove 'all' first
                    }

                    if (activeSet.has(val)) {
                        activeSet.delete(val); // Toggle off
                    } else {
                        activeSet.add(val); // Toggle on
                    }

                    // If nothing left selected, revert to 'All'
                    if (activeSet.size === 0) {
                        activeSet.add('all');
                    }
                }

                // Update Visuals
                buttons.forEach(b => {
                    if (activeSet.has(b.dataset.value)) {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });

                renderShows();
            });
        });
    }

    updateFilters(genreButtons, 'genre');
    if (levelButtons.length > 0) updateFilters(levelButtons, 'level');

    // Initial Render
    renderShows();
});

// FAQ Toggle Logic
window.toggleFaq = function (button) {
    const content = button.nextElementSibling;
    const icon = button.querySelector('svg');

    // Close others
    document.querySelectorAll('.group button + div').forEach(div => {
        if (div !== content) {
            div.style.height = '0';
            div.style.opacity = '0';
            const otherIcon = div.previousElementSibling.querySelector('svg');
            if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
        }
    });

    // Toggle current
    if (content.style.height === '0px' || !content.style.height) {
        content.style.height = content.scrollHeight + 'px';
        content.style.opacity = '1';
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.style.height = '0';
        content.style.opacity = '0';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
};
