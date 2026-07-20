// --- Конфигурация ---
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk';
const MUSIC_FOLDER = '/music';
const VIDEO_FOLDER = '/video';

// --- Состояние приложения ---
let albums = [];
let currentAlbum = null;
let token = '';
let videoFiles = [];
let currentVideo = null;

// --- DOM элементы ---
const authSection = document.getElementById('auth-section');
const tokenInput = document.getElementById('token-input');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');
const content = document.getElementById('content');

// Аудио
const albumGrid = document.getElementById('album-grid');
const player = document.getElementById('player');
const albumTitle = document.getElementById('album-title');
const albumCover = document.getElementById('album-cover');
const trackList = document.getElementById('track-list');
const audioPlayer = document.getElementById('audio-player');
const backBtn = document.getElementById('back-btn');

// Видео
const videoGrid = document.getElementById('video-grid');
const videoPlayerContainer = document.getElementById('video-player-container');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');

// Вкладки
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = {
    audio: document.getElementById('audio-tab'),
    video: document.getElementById('video-tab')
};

// --- Установка громкости по умолчанию ---
audioPlayer.volume = 0.3;
videoPlayer.volume = 0.3;

// --- Расширения файлов ---
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

// --- Вспомогательные функции API ---

async function apiRequest(endpoint, method = 'GET', body = null) {
    const url = `${YANDEX_API_BASE}${endpoint}`;
    const headers = {
        'Authorization': `OAuth ${token}`,
        'Accept': 'application/json'
    };
    if (body) {
        headers['Content-Type'] = 'application/json';
    }
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Ошибка ${response.status}`);
    }
    return response.json();
}

async function getFolderContents(path) {
    const data = await apiRequest(`/resources?path=${encodeURIComponent(path)}&limit=1000`);
    return data._embedded.items;
}

async function getDownloadLink(path) {
    const data = await apiRequest(`/resources/download?path=${encodeURIComponent(path)}`);
    return data.href;
}

// --- Загрузка аудио альбомов ---

async function loadAlbums() {
    try {
        const items = await getFolderContents(MUSIC_FOLDER);
        albums = items.filter(item => item.type === 'dir');
        renderAlbums();
    } catch (error) {
        console.error('Ошибка загрузки альбомов:', error);
        albumGrid.innerHTML = `<p style="color:red;">Не удалось загрузить альбомы: ${error.message}</p>`;
    }
}

function renderAlbums() {
    albumGrid.innerHTML = '';
    if (albums.length === 0) {
        albumGrid.innerHTML = '<p>В папке "music" нет папок-альбомов.</p>';
        return;
    }
    albums.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card';
        card.innerHTML = `
            <img src="placeholder.jpg" alt="${album.name}" data-path="${album.path}">
            <h3>${album.name}</h3>
        `;
        card.addEventListener('click', () => openAlbum(album));
        albumGrid.appendChild(card);
        loadCover(album.path, card.querySelector('img'));
    });
}

async function loadCover(albumPath, imgElement) {
    try {
        const items = await getFolderContents(albumPath);
        const imageFiles = items.filter(item => 
            item.type === 'file' && imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
        );
        if (imageFiles.length === 0) return;
        imageFiles.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aPriority = (aName.includes('cover') || aName.includes('folder')) ? 0 : 1;
            const bPriority = (bName.includes('cover') || bName.includes('folder')) ? 0 : 1;
            return aPriority - bPriority;
        });
        const firstImage = imageFiles[0];
        const downloadUrl = await getDownloadLink(firstImage.path);
        imgElement.src = downloadUrl;
    } catch (error) {
        console.warn('Не удалось загрузить обложку для', albumPath, error);
    }
}

// --- Открытие аудио альбома ---

async function openAlbum(album) {
    try {
        const items = await getFolderContents(album.path);
        const trackFiles = items.filter(item => 
            item.type === 'file' && /\.(mp3|wav|ogg|flac|m4a)$/i.test(item.name)
        );
        trackFiles.sort((a, b) => a.name.localeCompare(b.name));
        currentAlbum = { ...album, tracks: trackFiles };
        showPlayer();
    } catch (error) {
        console.error('Ошибка загрузки треков:', error);
        alert(`Не удалось загрузить треки: ${error.message}`);
    }
}

async function showPlayer() {
    albumGrid.style.display = 'none';
    player.style.display = 'block';
    albumTitle.textContent = currentAlbum.name;
    albumCover.src = 'placeholder.jpg';
    loadCover(currentAlbum.path, albumCover);
    trackList.innerHTML = '';
    for (const track of currentAlbum.tracks) {
        const li = document.createElement('li');
        li.textContent = track.name.replace(/\.[^.]+$/, '');
        li.dataset.trackPath = track.path;
        li.addEventListener('click', async () => await playTrack(li));
        trackList.appendChild(li);
    }
}

async function playTrack(liElement) {
    const trackPath = liElement.dataset.trackPath;
    try {
        const downloadUrl = await getDownloadLink(trackPath);
        audioPlayer.src = downloadUrl;
        audioPlayer.load();
        audioPlayer.play();
        trackList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        liElement.classList.add('active');
    } catch (error) {
        console.error('Ошибка воспроизведения:', error);
        alert(`Не удалось получить ссылку на трек: ${error.message}`);
    }
}

audioPlayer.addEventListener('ended', function() {
    const activeLi = trackList.querySelector('li.active');
    if (activeLi && activeLi.nextElementSibling) {
        playTrack(activeLi.nextElementSibling);
    }
});

backBtn.addEventListener('click', () => {
    player.style.display = 'none';
    albumGrid.style.display = 'grid';
    audioPlayer.pause();
    audioPlayer.src = '';
    trackList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
});

// --- ЗАГРУЗКА ВИДЕО С ПРЕВЬЮ ---

async function loadVideos() {
    try {
        const items = await getFolderContents(VIDEO_FOLDER);
        // Разделяем на видео и изображения
        const videoItems = items.filter(item => 
            item.type === 'file' && videoExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
        );
        const imageItems = items.filter(item => 
            item.type === 'file' && imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
        );

        // Для каждого видео ищем соответствующее изображение
        videoFiles = videoItems.map(video => {
            const baseName = video.name.replace(/\.[^.]+$/, ''); // имя без расширения
            // Ищем изображение с таким же базовым именем (регистронезависимо)
            const thumbnail = imageItems.find(img => 
                img.name.replace(/\.[^.]+$/, '').toLowerCase() === baseName.toLowerCase()
            );
            return {
                ...video,
                thumbnailItem: thumbnail || null
            };
        });
        videoFiles.sort((a, b) => a.name.localeCompare(b.name));
        renderVideos();
    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        videoGrid.innerHTML = `<p style="color:red;">Не удалось загрузить видео: ${error.message}</p>`;
    }
}

function renderVideos() {
    videoGrid.innerHTML = '';
    if (videoFiles.length === 0) {
        videoGrid.innerHTML = '<p>В папке "video" нет видеофайлов.</p>';
        return;
    }
    videoFiles.forEach(file => {
        const card = document.createElement('div');
        card.className = 'video-card';

        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'video-thumbnail';

        if (file.thumbnailItem) {
            const img = document.createElement('img');
            img.alt = file.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            thumbDiv.appendChild(img);
            // Загружаем картинку-превью
            loadVideoThumbnail(file, img);
        } else {
            thumbDiv.innerHTML = '<span>▶</span>';
        }

        card.appendChild(thumbDiv);
        const p = document.createElement('p');
        p.textContent = file.name;
        card.appendChild(p);

        card.addEventListener('click', () => toggleVideo(file, card));
        videoGrid.appendChild(card);
    });
}

async function loadVideoThumbnail(file, imgElement) {
    if (!file.thumbnailItem) return;
    try {
        const downloadUrl = await getDownloadLink(file.thumbnailItem.path);
        imgElement.src = downloadUrl;
    } catch (error) {
        console.warn('Не удалось загрузить превью для', file.name, error);
    }
}

// --- Переключение видео (показ/скрытие плеера) ---

function toggleVideo(file, card) {
    // Если плеер уже показывает это видео, скрываем его
    if (currentVideo && currentVideo.path === file.path && videoPlayerContainer.style.display !== 'none') {
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayerContainer.style.display = 'none';
        videoTitle.textContent = '';
        currentVideo = null;
        document.querySelectorAll('.video-card').forEach(c => c.classList.remove('active'));
        return;
    }
    // Иначе показываем/переключаем видео
    playVideo(file);
}

async function playVideo(file) {
    try {
        const downloadUrl = await getDownloadLink(file.path);
        videoPlayer.src = downloadUrl;
        videoPlayer.load();
        videoPlayer.play();
        videoPlayerContainer.style.display = 'block';
        videoTitle.textContent = file.name;
        document.querySelectorAll('.video-card').forEach(c => c.classList.remove('active'));
        // Находим карточку с этим файлом и подсвечиваем
        const cards = document.querySelectorAll('.video-card');
        for (let card of cards) {
            if (card.querySelector('p').textContent === file.name) {
                card.classList.add('active');
                break;
            }
        }
        currentVideo = file;
    } catch (error) {
        console.error('Ошибка воспроизведения видео:', error);
        alert(`Не удалось получить ссылку на видео: ${error.message}`);
    }
}

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        Object.values(tabPanes).forEach(pane => pane.classList.remove('active'));

        btn.classList.add('active');
        const tab = btn.dataset.tab;
        tabPanes[tab].classList.add('active');

        if (tab === 'video' && videoFiles.length === 0) {
            loadVideos();
        }

        if (tab === 'audio') {
            videoPlayer.pause();
            videoPlayer.src = '';
            videoPlayerContainer.style.display = 'none';
            videoTitle.textContent = '';
            currentVideo = null;
            document.querySelectorAll('.video-card').forEach(c => c.classList.remove('active'));
        } else if (tab === 'video') {
            audioPlayer.pause();
            trackList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        }
    });
});

// --- АВТОРИЗАЦИЯ ---

authBtn.addEventListener('click', async () => {
    token = tokenInput.value.trim();
    if (!token) {
        authError.textContent = 'Пожалуйста, введите OAuth-токен.';
        return;
    }
    authError.textContent = '';
    try {
        const response = await fetch(`${YANDEX_API_BASE}/`, {
            headers: { 'Authorization': `OAuth ${token}` }
        });
        if (!response.ok) {
            throw new Error('Неверный токен или истек срок действия.');
        }
        authSection.style.display = 'none';
        content.style.display = 'block';
        await loadAlbums();
    } catch (error) {
        authError.textContent = `Ошибка авторизации: ${error.message}`;
        token = '';
    }
});

tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authBtn.click();
});
