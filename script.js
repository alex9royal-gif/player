// --- Конфигурация ---
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk';
const MUSIC_FOLDER = '/music'; // Папка на Яндекс.Диске, где лежат альбомы

// --- Состояние приложения ---
let albums = [];
let currentAlbum = null;
let token = '';

// --- DOM элементы ---
const authSection = document.getElementById('auth-section');
const tokenInput = document.getElementById('token-input');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');
const content = document.getElementById('content');
const albumGrid = document.getElementById('album-grid');
const player = document.getElementById('player');
const albumTitle = document.getElementById('album-title');
const albumCover = document.getElementById('album-cover');
const trackList = document.getElementById('track-list');
const audioPlayer = document.getElementById('audio-player');
const backBtn = document.getElementById('back-btn');

// --- Вспомогательные функции API ---

// Универсальный запрос к API Яндекс.Диска
async function apiRequest(endpoint, method = 'GET', body = null) {
    const url = `${YANDEX_API_BASE}${endpoint}`;
    const headers = {
        'Authorization': `${token}`,
        'Accept': 'application/json'
    };
    if (body) {
        headers['Content-Type'] = 'application/json';
    }
    const options = {
        method,
        headers,
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Ошибка ${response.status}`);
    }
    return response.json();
}

// Получение содержимого папки (ресурсы)
async function getFolderContents(path) {
    const data = await apiRequest(`/resources?path=${encodeURIComponent(path)}&limit=1000`);
    return data._embedded.items;
}

// Получение ссылки на скачивание файла
async function getDownloadLink(path) {
    const data = await apiRequest(`/resources/download?path=${encodeURIComponent(path)}`);
    return data.href;
}

// --- Загрузка альбомов ---

async function loadAlbums() {
    try {
        const items = await getFolderContents(MUSIC_FOLDER);
        // Оставляем только папки
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
        // Пытаемся найти обложку (cover.jpg, folder.jpg) — позже загрузим отдельно
        card.innerHTML = `
            <img src="placeholder.jpg" alt="${album.name}" data-path="${album.path}">
            <h3>${album.name}</h3>
        `;
        card.addEventListener('click', () => openAlbum(album));
        albumGrid.appendChild(card);
        
        // Попробуем загрузить обложку, если есть
        loadCover(album.path, card.querySelector('img'));
    });
}

// --- Загрузка обложки альбома (любое изображение в папке) ---
async function loadCover(albumPath, imgElement) {
    try {
        // Получаем все файлы в папке альбома
        const items = await getFolderContents(albumPath);
        // Расширения, которые считаем изображениями
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const imageFiles = items.filter(item => 
            item.type === 'file' && imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
        );
        if (imageFiles.length > 0) {
            // Сортируем: сначала файлы с "cover" или "folder" в имени (для приоритета)
            imageFiles.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aPriority = (aName.includes('cover') || aName.includes('folder')) ? 0 : 1;
                const bPriority = (bName.includes('cover') || bName.includes('folder')) ? 0 : 1;
                return aPriority - bPriority;
            });
            // Берём первое подходящее изображение
            const link = await getDownloadLink(imageFiles[0].path);
            imgElement.src = link;
        }
        // Если изображений нет – оставляем placeholder
    } catch (error) {
        console.warn('Не удалось загрузить обложку для', albumPath, error);
    }
}

// --- Открытие альбома (список треков) ---

async function openAlbum(album) {
    try {
        const items = await getFolderContents(album.path);
        const trackFiles = items.filter(item => 
            item.type === 'file' && /\.(mp3|wav|ogg|flac|m4a)$/i.test(item.name)
        );
        // Сортируем по имени
        trackFiles.sort((a, b) => a.name.localeCompare(b.name));
        
        currentAlbum = {
            ...album,
            tracks: trackFiles
        };
        
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
    albumCover.src = 'placeholder.jpg'; // временно
    
    // Загружаем обложку альбома (если есть)
    loadCover(currentAlbum.path, albumCover);
    
    trackList.innerHTML = '';
    // Для каждого трека получаем ссылку на скачивание и сохраняем в атрибуте data-url
    for (const track of currentAlbum.tracks) {
        const li = document.createElement('li');
        li.textContent = track.name.replace(/\.[^.]+$/, ''); // имя без расширения
        li.dataset.trackPath = track.path;
        // Ссылку получим при клике (или заранее)
        li.addEventListener('click', async () => {
            await playTrack(li);
        });
        trackList.appendChild(li);
    }
    
    // Автоматически играем первый трек
    if (currentAlbum.tracks.length > 0) {
        const firstLi = trackList.querySelector('li');
        await playTrack(firstLi);
    }
}

async function playTrack(liElement) {
    const trackPath = liElement.dataset.trackPath;
    try {
        const downloadUrl = await getDownloadLink(trackPath);
        audioPlayer.src = downloadUrl;
        audioPlayer.load();
        audioPlayer.play();
        // Подсветка
        trackList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        liElement.classList.add('active');
    } catch (error) {
        console.error('Ошибка воспроизведения:', error);
        alert(`Не удалось получить ссылку на трек: ${error.message}`);
    }
}

// --- Навигация ---

backBtn.addEventListener('click', () => {
    player.style.display = 'none';
    albumGrid.style.display = 'grid';
    audioPlayer.pause();
    audioPlayer.src = '';
});

// --- Авторизация ---

authBtn.addEventListener('click', async () => {
    token = tokenInput.value.trim();
    if (!token) {
        authError.textContent = 'Пожалуйста, введите OAuth-токен.';
        return;
    }
    authError.textContent = '';
    try {
        // Проверим токен, запросив информацию о диске
        const response = await fetch(`${YANDEX_API_BASE}/`, {
            headers: { 'Authorization': `OAuth ${token}` }
        });
        if (!response.ok) {
            throw new Error('Неверный токен или истек срок действия.');
        }
        // Токен рабочий
        authSection.style.display = 'none';
        content.style.display = 'block';
        await loadAlbums();
    } catch (error) {
        authError.textContent = `Ошибка авторизации: ${error.message}`;
        token = '';
    }
});

// Также можно разрешить загрузку по Enter в поле ввода
tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        authBtn.click();
    }
});
