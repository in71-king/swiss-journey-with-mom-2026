const buttons = [...document.querySelectorAll('.photo-button')];

if (window.startTravelDiaryAtTop) {
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

const dialog = document.querySelector('.lightbox');
const lightboxImage = dialog.querySelector('img');
const lightboxControls = dialog.querySelector('.lightbox-controls');
const closeButton = dialog.querySelector('.lightbox-close');
const previousButton = dialog.querySelector('.lightbox-prev');
const nextButton = dialog.querySelector('.lightbox-next');
const foldedPhonePortrait = window.matchMedia('(max-width: 600px) and (orientation: portrait)');
const boundaryDialog = document.querySelector('.image-boundary-dialog');
const boundaryMessage = boundaryDialog.querySelector('p');
const boundaryYesButton = boundaryDialog.querySelector('[data-boundary-answer="yes"]');
const boundaryNoButton = boundaryDialog.querySelector('[data-boundary-answer="no"]');
const photoGroups = [...document.querySelectorAll('figure.photo-card')]
  .map(figure => ({ figure, buttons: [...figure.querySelectorAll('.photo-button')] }))
  .filter(group => group.buttons.length);
const groupByButton = new Map();
photoGroups.forEach((group, groupIndex) => {
  group.buttons.forEach((button, imageIndex) => groupByButton.set(button, { groupIndex, imageIndex }));
});
let currentIndex = 0;
let touchStartX = 0;
let touchGestureIsPinch = false;
let pendingBoundaryTarget = null;

function updateLightboxOrientation() {
  if (!lightboxImage.naturalWidth || !lightboxImage.naturalHeight) return;
  const imageRatio = lightboxImage.naturalWidth / lightboxImage.naturalHeight;
  dialog.classList.toggle('is-auto-rotated', foldedPhonePortrait.matches && imageRatio >= 1.55);
  lightboxImage.classList.remove('is-loading');
}

function requestPortraitOrientation() {
  if (!screen.orientation?.lock) return;
  try {
    screen.orientation.lock('portrait-primary').catch(() => {});
  } catch {
    // 일반 브라우저 탭에서는 운영체제가 방향 잠금을 허용하지 않을 수 있다.
  }
}

function showImage(index) {
  currentIndex = Math.min(buttons.length - 1, Math.max(0, index));
  const button = buttons[currentIndex];
  lightboxImage.classList.add('is-loading');
  dialog.classList.remove('is-auto-rotated');
  lightboxImage.src = button.dataset.image;
  lightboxImage.alt = button.querySelector('img').alt;
  if (lightboxImage.complete) requestAnimationFrame(updateLightboxOrientation);
}

lightboxImage.addEventListener('load', updateLightboxOrientation);
foldedPhonePortrait.addEventListener('change', updateLightboxOrientation);

function lightboxIsZoomed() {
  const viewport = window.visualViewport;
  if (!viewport) return false;
  const reportedScale = viewport.scale || 1;
  const inferredScale = viewport.width > 0
    ? document.documentElement.clientWidth / viewport.width
    : 1;
  return Math.max(reportedScale, inferredScale) > 1.03;
}

function syncLightboxControlsToViewport() {
  if (!dialog.open || !lightboxControls) return;
  const viewport = window.visualViewport;
  if (!viewport) {
    lightboxControls.removeAttribute('style');
    return;
  }
  const scale = Math.max(1, viewport.scale || 1);
  lightboxControls.style.width = `${viewport.width * scale}px`;
  lightboxControls.style.height = `${viewport.height * scale}px`;
  lightboxControls.style.transform = `translate3d(${viewport.offsetLeft}px, ${viewport.offsetTop}px, 0) scale(${1 / scale})`;
}

function moveWithinLightbox(direction, { allowWhenZoomed = false } = {}) {
  if (!allowWhenZoomed && lightboxIsZoomed()) return;
  const currentButton = buttons[currentIndex];
  const position = groupByButton.get(currentButton);
  if (!position) return;

  const group = photoGroups[position.groupIndex];
  const nextImageIndex = position.imageIndex + direction;
  if (nextImageIndex >= 0 && nextImageIndex < group.buttons.length) {
    showImage(buttons.indexOf(group.buttons[nextImageIndex]));
    return;
  }

  pendingBoundaryTarget = group.figure;
  boundaryMessage.textContent = direction > 0
    ? '마지막 이미지입니다. 종료하시겠습니까?'
    : '처음 이미지입니다. 종료하시겠습니까?';
  boundaryDialog.showModal();
}

function closeBoundaryDialog() {
  pendingBoundaryTarget = null;
  boundaryDialog.close();
}

buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    requestPortraitOrientation();
    showImage(index);
    dialog.showModal();
    requestAnimationFrame(syncLightboxControlsToViewport);
  });
});

closeButton.addEventListener('click', () => dialog.close());
previousButton.addEventListener('click', event => {
  event.stopPropagation();
  moveWithinLightbox(-1, { allowWhenZoomed: true });
});
nextButton.addEventListener('click', event => {
  event.stopPropagation();
  moveWithinLightbox(1, { allowWhenZoomed: true });
});
dialog.addEventListener('close', () => lightboxControls.removeAttribute('style'));
window.visualViewport?.addEventListener('resize', syncLightboxControlsToViewport);
window.visualViewport?.addEventListener('scroll', syncLightboxControlsToViewport);

boundaryNoButton.addEventListener('click', closeBoundaryDialog);
boundaryYesButton.addEventListener('click', () => {
  const target = pendingBoundaryTarget;
  closeBoundaryDialog();
  dialog.close();
  requestAnimationFrame(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
});
boundaryDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeBoundaryDialog();
});

dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') moveWithinLightbox(-1);
  if (event.key === 'ArrowRight') moveWithinLightbox(1);
});

dialog.addEventListener('touchstart', event => {
  if (lightboxIsZoomed() || event.touches.length > 1 || event.changedTouches.length > 1) {
    touchGestureIsPinch = true;
    return;
  }
  if (!touchGestureIsPinch && event.touches[0]) {
    touchStartX = event.touches[0].screenX;
  }
}, { passive: true });

dialog.addEventListener('touchmove', event => {
  if (lightboxIsZoomed() || event.touches.length > 1) touchGestureIsPinch = true;
}, { passive: true });

dialog.addEventListener('touchend', event => {
  if (lightboxIsZoomed()) touchGestureIsPinch = true;
  if (touchGestureIsPinch) {
    if (event.touches.length === 0) {
      touchGestureIsPinch = false;
      touchStartX = 0;
    }
    return;
  }
  if (event.touches.length > 0 || !event.changedTouches[0]) return;
  const delta = event.changedTouches[0].screenX - touchStartX;
  touchStartX = 0;
  if (Math.abs(delta) < 45) return;
  moveWithinLightbox(delta < 0 ? 1 : -1);
}, { passive: true });

dialog.addEventListener('touchcancel', () => {
  touchGestureIsPinch = false;
  touchStartX = 0;
}, { passive: true });

const mapDialog = document.querySelector('.map-dialog');
const openMapButton = document.querySelector('.map-open-button');
const closeMapButton = document.querySelector('.map-dialog-close');
const mapViewport = document.querySelector('.map-viewport');
const zoomMap = document.querySelector('.zoom-map-content');
const mapRecordDialog = document.querySelector('.map-record-dialog');
const mapRecordMessage = document.querySelector('#map-record-message');
const mapRecordYes = mapRecordDialog.querySelector('[data-map-record-answer="yes"]');
const mapRecordNo = mapRecordDialog.querySelector('[data-map-record-answer="no"]');
const overviewMapMarkers = [...document.querySelectorAll('.overview-map-svg .svg-map-marker[data-target]')];
const mapRecordMarkers = [...mapDialog.querySelectorAll('.svg-map-marker[data-target]')];
const mapInitialFocus = { x: 0, y: 70, width: 1000, height: 560 };
let initialMapScale = 1;
let minMapScale = .35;
let maxMapScale = 5;
let mapScale = 1;
let mapX = 0;
let mapY = 0;
const activePointers = new Map();
let lastPinchDistance = 0;
let pendingMapRecordTarget = null;
let mapResizeFrame = 0;
let lastMapViewportSize = { width: 0, height: 0 };

function updateMapTransform() {
  zoomMap.style.transform = `translate3d(${mapX}px, ${mapY}px, 0) scale(${mapScale})`;
}

function setMapScale(nextScale) {
  const next = Math.min(maxMapScale, Math.max(minMapScale, nextScale));
  const factor = next / mapScale;
  const focusX = mapViewport.clientWidth / 2;
  const focusY = mapViewport.clientHeight / 2;
  mapX = focusX - (focusX - mapX) * factor;
  mapY = focusY - (focusY - mapY) * factor;
  mapScale = next;
  updateMapTransform();
}

function resetMap() {
  const viewportWidth = Math.max(1, mapViewport.clientWidth);
  const viewportHeight = Math.max(1, mapViewport.clientHeight);
  const padding = Math.max(18, Math.min(42, Math.min(viewportWidth, viewportHeight) * .06));
  initialMapScale = Math.min(
    (viewportWidth - padding * 2) / mapInitialFocus.width,
    (viewportHeight - padding * 2) / mapInitialFocus.height
  );
  minMapScale = Math.max(.2, initialMapScale * .55);
  maxMapScale = Math.max(3, initialMapScale * 5);
  mapScale = initialMapScale;
  mapX = (viewportWidth - mapInitialFocus.width * mapScale) / 2 - mapInitialFocus.x * mapScale;
  mapY = (viewportHeight - mapInitialFocus.height * mapScale) / 2 - mapInitialFocus.y * mapScale;
  lastMapViewportSize = { width: viewportWidth, height: viewportHeight };
  updateMapTransform();
}

function refitMapForViewport() {
  if (!mapDialog.open) return;
  cancelAnimationFrame(mapResizeFrame);
  mapResizeFrame = requestAnimationFrame(() => {
    const width = mapViewport.clientWidth;
    const height = mapViewport.clientHeight;
    const sizeChanged = Math.abs(width - lastMapViewportSize.width) > 2
      || Math.abs(height - lastMapViewportSize.height) > 2;
    const shouldRotate = shouldUseLandscapeFullscreen();
    const rotationChanged = mapDialog.classList.contains('is-rotated') !== shouldRotate;
    if (!sizeChanged && !rotationChanged) return;
    mapDialog.classList.toggle('is-rotated', shouldRotate);
    resetMap();
  });
}

function openMapDialog() {
  requestPortraitOrientation();
  mapDialog.classList.toggle('is-rotated', shouldUseLandscapeFullscreen());
  document.body.classList.add('map-dialog-open');
  mapDialog.showModal();
  requestAnimationFrame(resetMap);
}

function closeMapDialog() {
  mapDialog.close();
}

openMapButton.addEventListener('click', openMapDialog);
closeMapButton.addEventListener('click', closeMapDialog);
mapDialog.addEventListener('close', () => {
  mapDialog.classList.remove('is-rotated');
  document.body.classList.remove('map-dialog-open');
  activePointers.clear();
  lastPinchDistance = 0;
});

function goToTravelRecord(target) {
  if (!target) return;
  history.pushState(null, '', target);
  document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

overviewMapMarkers.forEach(marker => {
  const askToOpenRecord = event => {
    event.stopPropagation();
    pendingMapRecordTarget = marker.dataset.target;
    mapRecordMessage.textContent = `${marker.dataset.dayLabel} (${marker.dataset.placeLabel})\n여행일지로 이동할까요?`;
    mapRecordDialog.classList.remove('is-rotated');
    mapRecordDialog.showModal();
  };
  marker.addEventListener('click', askToOpenRecord);
  marker.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    askToOpenRecord(event);
  });
});

mapRecordMarkers.forEach(marker => {
  marker.addEventListener('pointerdown', event => event.stopPropagation());
  const askToOpenRecord = event => {
    event.stopPropagation();
    pendingMapRecordTarget = marker.dataset.target;
    mapRecordMessage.textContent = `${marker.dataset.dayLabel} (${marker.dataset.placeLabel})\n여행일지로 이동할까요?`;
    mapRecordDialog.classList.toggle('is-rotated', mapDialog.classList.contains('is-rotated'));
    mapRecordDialog.showModal();
  };
  marker.addEventListener('click', askToOpenRecord);
  marker.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    askToOpenRecord(event);
  });
});
mapRecordNo.addEventListener('click', () => {
  pendingMapRecordTarget = null;
  mapRecordDialog.close();
});
mapRecordDialog.addEventListener('close', () => {
  pendingMapRecordTarget = null;
  mapRecordDialog.classList.remove('is-rotated');
});
mapRecordYes.addEventListener('click', () => {
  const target = pendingMapRecordTarget;
  pendingMapRecordTarget = null;
  mapRecordDialog.close();
  if (mapDialog.open) mapDialog.close();
  requestAnimationFrame(() => goToTravelRecord(target));
});

const mobileMenuHandle = document.querySelector('.mobile-menu-handle');
const mobileNavigation = document.querySelector('.mobile-navigation');
const mobileNavigationPanel = mobileNavigation.querySelector('.mobile-navigation-panel');
const mobileNavigationClose = mobileNavigation.querySelector('.mobile-navigation-close');
const mobileNavigationMap = mobileNavigation.querySelector('.mobile-navigation-map');
const mobileNavigationDays = mobileNavigation.querySelector('.mobile-navigation-days');
const dayStories = [...document.querySelectorAll('.day-story[id]')];
let mobileMenuPointerStartX = null;
let mobilePanelTouchStartX = null;

function closeMobileNavigationThen(action) {
  mobileNavigation.addEventListener('close', () => requestAnimationFrame(action), { once: true });
  mobileNavigation.close();
}

document.querySelectorAll('.day-list .day-card[href^="#day"]').forEach(card => {
  const link = document.createElement('a');
  link.href = card.getAttribute('href');
  const number = card.querySelector('.day-number')?.textContent?.trim() || '';
  const title = card.querySelector('h3')?.textContent?.trim() || '';
  link.innerHTML = `<span>${number}</span><strong>${title}</strong>`;
  link.addEventListener('click', event => {
    event.preventDefault();
    const target = link.getAttribute('href');
    closeMobileNavigationThen(() => goToTravelRecord(target));
  });
  mobileNavigationDays.append(link);
});

function currentTravelRecordId() {
  const readingLine = window.innerHeight * .38;
  const visible = dayStories.find(story => {
    const bounds = story.getBoundingClientRect();
    return bounds.top <= readingLine && bounds.bottom > readingLine;
  });
  if (visible) return `#${visible.id}`;
  const nearest = dayStories
    .map(story => ({ story, distance: Math.abs(story.getBoundingClientRect().top - readingLine) }))
    .sort((a, b) => a.distance - b.distance)[0]?.story;
  return nearest ? `#${nearest.id}` : '';
}

function updateMobileNavigationCurrentDay() {
  const currentTarget = currentTravelRecordId();
  mobileNavigationDays.querySelectorAll('a').forEach(link => {
    const isCurrent = link.getAttribute('href') === currentTarget;
    link.classList.toggle('is-current', isCurrent);
    if (isCurrent) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function openMobileNavigation() {
  if (mobileNavigation.open) return;
  updateMobileNavigationCurrentDay();
  mobileNavigation.showModal();
  mobileMenuHandle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-navigation-open');
}

function finishClosingMobileNavigation() {
  mobileMenuHandle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-navigation-open');
}

mobileMenuHandle.addEventListener('click', openMobileNavigation);
mobileMenuHandle.addEventListener('pointerdown', event => {
  mobileMenuPointerStartX = event.clientX;
  mobileMenuHandle.setPointerCapture?.(event.pointerId);
});
mobileMenuHandle.addEventListener('pointerup', event => {
  if (mobileMenuPointerStartX !== null && event.clientX - mobileMenuPointerStartX < -24) {
    openMobileNavigation();
  }
  mobileMenuPointerStartX = null;
});
mobileMenuHandle.addEventListener('pointercancel', () => {
  mobileMenuPointerStartX = null;
});

mobileNavigationClose.addEventListener('click', () => mobileNavigation.close());
mobileNavigationMap.addEventListener('click', () => {
  closeMobileNavigationThen(openMapDialog);
});
mobileNavigation.addEventListener('cancel', event => {
  event.preventDefault();
  mobileNavigation.close();
});
mobileNavigation.addEventListener('close', finishClosingMobileNavigation);
mobileNavigation.addEventListener('click', event => {
  if (event.target === mobileNavigation) mobileNavigation.close();
});
mobileNavigationPanel.addEventListener('touchstart', event => {
  mobilePanelTouchStartX = event.touches[0]?.clientX ?? null;
}, { passive: true });
mobileNavigationPanel.addEventListener('touchend', event => {
  const endX = event.changedTouches[0]?.clientX;
  if (mobilePanelTouchStartX !== null && endX !== undefined && endX - mobilePanelTouchStartX > 70) {
    mobileNavigation.close();
  }
  mobilePanelTouchStartX = null;
}, { passive: true });

mapViewport.addEventListener('wheel', event => {
  event.preventDefault();
  setMapScale(mapScale * (event.deltaY < 0 ? 1.16 : .86));
}, { passive: false });

mapViewport.addEventListener('pointerdown', event => {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  mapViewport.setPointerCapture(event.pointerId);
});

mapViewport.addEventListener('pointermove', event => {
  const previous = activePointers.get(event.pointerId);
  if (!previous) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...activePointers.values()];
  if (points.length === 1) {
    const screenX = event.clientX - previous.x;
    const screenY = event.clientY - previous.y;
    const deltaX = mapDialog.classList.contains('is-rotated') ? screenY : screenX;
    const deltaY = mapDialog.classList.contains('is-rotated') ? -screenX : screenY;
    mapX += deltaX;
    mapY += deltaY;
    updateMapTransform();
  } else if (points.length === 2) {
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (lastPinchDistance) setMapScale(mapScale * (distance / lastPinchDistance));
    lastPinchDistance = distance;
  }
});

function releasePointer(event) {
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) lastPinchDistance = 0;
}

mapViewport.addEventListener('pointerup', releasePointer);
mapViewport.addEventListener('pointercancel', releasePointer);
mapDialog.addEventListener('click', event => {
  if (event.target === mapDialog) mapDialog.close();
});

if ('ResizeObserver' in window) {
  const mapResizeObserver = new ResizeObserver(refitMapForViewport);
  mapResizeObserver.observe(mapViewport);
}
window.visualViewport?.addEventListener('resize', refitMapForViewport);
window.addEventListener('orientationchange', refitMapForViewport);

const playIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 9v30l25-15z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 9h9v30h-9zm15 0h9v30h-9z"/></svg>';
const fullscreenIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h14v5h-9v9H8zm18 0h14v14h-5v-9h-9zM8 26h5v9h9v5H8zm27 0h5v14H26v-5h9z"/></svg>';

const inlineVideoObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const player = entry.target;
    const video = player.querySelector('video');
    if (!entry.isIntersecting && !player.classList.contains('is-theater') && video && !video.paused) {
      video.pause();
    }
  });
}, { threshold: 0 });

let fullscreenReturn = null;
let restoringFullscreenPosition = false;
let activeTheaterPlayer = null;
let theaterHistoryActive = false;

function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function shouldUseLandscapeFullscreen() {
  return window.matchMedia('(max-width: 700px)').matches && window.innerHeight > window.innerWidth;
}

function rememberFullscreenPosition(player) {
  fullscreenReturn = {
    player,
    viewportTop: player.getBoundingClientRect().top
  };
}

function restoreFullscreenPosition() {
  if (!fullscreenReturn || restoringFullscreenPosition) return;
  restoringFullscreenPosition = true;
  const { player, viewportTop } = fullscreenReturn;
  const restore = () => {
    if (!player.isConnected) return;
    const difference = player.getBoundingClientRect().top - viewportTop;
    window.scrollBy({ top: difference, left: 0, behavior: 'instant' });
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    restore();
    window.setTimeout(() => {
      restore();
      fullscreenReturn = null;
      restoringFullscreenPosition = false;
    }, 220);
  }));
}

function enterVideoFullscreen(player) {
  if (activeTheaterPlayer) return;
  requestPortraitOrientation();
  rememberFullscreenPosition(player);
  activeTheaterPlayer = player;
  player.classList.add('is-theater');
  const keepPortrait = player.dataset.fullscreenOrientation === 'portrait';
  player.classList.toggle('is-rotated', !keepPortrait && shouldUseLandscapeFullscreen());
  document.body.classList.add('video-theater-open');
  history.pushState({ ...history.state, videoTheater: true }, '');
  theaterHistoryActive = true;
}

function leaveVideoFullscreen({ fromHistory = false } = {}) {
  if (!activeTheaterPlayer) return;
  activeTheaterPlayer.classList.remove('is-theater', 'is-rotated');
  document.body.classList.remove('video-theater-open');
  activeTheaterPlayer = null;
  restoreFullscreenPosition();
  if (theaterHistoryActive && !fromHistory) history.back();
  theaterHistoryActive = false;
}

window.addEventListener('popstate', () => {
  if (activeTheaterPlayer) leaveVideoFullscreen({ fromHistory: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeTheaterPlayer) leaveVideoFullscreen();
});

document.querySelectorAll('.video-card video').forEach(video => {
  const card = video.closest('.video-card');
  const playlist = (card.dataset.videoPlaylist || video.currentSrc || video.querySelector('source')?.src || '')
    .split('|')
    .filter(Boolean);
  const durations = new Array(playlist.length).fill(0);
  let playlistIndex = 0;
  let pendingSeek = null;
  let controlsTimer = 0;
  let isSeeking = false;
  let seekingPointerId = null;

  video.controls = false;
  video.removeAttribute('controls');

  const player = document.createElement('div');
  player.className = 'video-player';
  player.dataset.fullscreenOrientation = card.dataset.fullscreenOrientation || 'auto';
  player.setAttribute('aria-label', card.querySelector('figcaption strong')?.textContent || '여행 영상');
  video.before(player);
  player.append(video);

  const controls = document.createElement('div');
  controls.className = 'video-controls';
  controls.innerHTML = `
    <input class="video-progress" type="range" min="0" max="1000" value="0" aria-label="영상 재생 위치">
    <button class="video-control-button video-play-pause" type="button" aria-label="영상 재생">${playIcon}</button>
    <span class="video-time" aria-live="off">0:00 / 0:00</span>
    <button class="video-control-button video-enter-fullscreen" type="button" aria-label="전체화면으로 보기">${fullscreenIcon}</button>`;

  const exitFullscreen = document.createElement('button');
  exitFullscreen.type = 'button';
  exitFullscreen.className = 'video-exit-fullscreen';
  exitFullscreen.textContent = '× 나가기';

  player.append(controls, exitFullscreen);
  inlineVideoObserver.observe(player);

  const playPause = controls.querySelector('.video-play-pause');
  const progress = controls.querySelector('.video-progress');
  const time = controls.querySelector('.video-time');
  const enterFullscreenButton = controls.querySelector('.video-enter-fullscreen');

  function showVideoControls({ autoHide = true } = {}) {
    window.clearTimeout(controlsTimer);
    player.classList.remove('controls-hidden');
    if (autoHide && !video.paused && !isSeeking) {
      controlsTimer = window.setTimeout(() => player.classList.add('controls-hidden'), 2200);
    }
  }

  function playlistTotalDuration() {
    const knownTotal = durations.reduce((sum, duration) => sum + duration, 0);
    return durations.every(duration => duration > 0) ? knownTotal : video.duration || knownTotal;
  }

  function elapsedBeforeCurrent() {
    return durations.slice(0, playlistIndex).reduce((sum, duration) => sum + duration, 0);
  }

  function updatePlayer() {
    const total = playlist.length > 1 ? playlistTotalDuration() : video.duration;
    const current = playlist.length > 1 ? elapsedBeforeCurrent() + video.currentTime : video.currentTime;
    progress.value = total > 0 ? String(Math.min(1000, Math.round(current / total * 1000))) : '0';
    progress.style.setProperty('--seek-percent', `${Number(progress.value) / 10}%`);
    time.textContent = `${formatVideoTime(current)} / ${formatVideoTime(total)}`;
    const paused = video.paused;
    playPause.innerHTML = paused ? playIcon : pauseIcon;
    playPause.setAttribute('aria-label', paused ? '영상 재생' : '영상 일시정지');
  }

  function setPlaylistSource(index, { autoplay = false, seek = null } = {}) {
    playlistIndex = Math.max(0, Math.min(playlist.length - 1, index));
    pendingSeek = seek;
    video.src = playlist[playlistIndex];
    video.load();
    const resume = () => {
      if (pendingSeek !== null) {
        video.currentTime = Math.min(pendingSeek, Math.max(0, video.duration - .05));
        pendingSeek = null;
      }
      if (autoplay) video.play().catch(() => updatePlayer());
      updatePlayer();
    };
    video.addEventListener('loadedmetadata', resume, { once: true });
  }

  async function togglePlayback({ allowFullscreen = false } = {}) {
    if (video.paused || video.ended) {
      if (allowFullscreen) enterVideoFullscreen(player);
      video.removeAttribute('poster');
      if (video.ended && playlistIndex === playlist.length - 1) setPlaylistSource(0, { autoplay: true });
      else await video.play().catch(() => {});
    } else {
      video.pause();
    }
    updatePlayer();
  }

  playlist.forEach((source, index) => {
    const probe = document.createElement('video');
    probe.preload = index === 1 ? 'auto' : 'metadata';
    probe.src = source;
    probe.addEventListener('loadedmetadata', () => {
      durations[index] = probe.duration;
      updatePlayer();
    }, { once: true });
  });

  video.addEventListener('loadedmetadata', () => {
    durations[playlistIndex] = video.duration;
    updatePlayer();
  });
  video.addEventListener('timeupdate', updatePlayer);
  video.addEventListener('play', () => {
    updatePlayer();
    showVideoControls();
  });
  video.addEventListener('pause', () => {
    updatePlayer();
    showVideoControls({ autoHide: false });
  });
  video.addEventListener('ended', () => {
    if (playlistIndex < playlist.length - 1) setPlaylistSource(playlistIndex + 1, { autoplay: true });
    else updatePlayer();
  });

  function seekToProgressValue() {
    progress.style.setProperty('--seek-percent', `${Number(progress.value) / 10}%`);
    const total = playlistTotalDuration();
    if (!total) return;
    const target = Number(progress.value) / 1000 * total;
    if (playlist.length === 1) {
      video.currentTime = target;
      return;
    }
    let accumulated = 0;
    let targetIndex = playlist.length - 1;
    for (let index = 0; index < durations.length; index += 1) {
      if (target <= accumulated + durations[index]) {
        targetIndex = index;
        break;
      }
      accumulated += durations[index];
    }
    const wasPlaying = !video.paused;
    if (targetIndex === playlistIndex) video.currentTime = Math.max(0, target - accumulated);
    else setPlaylistSource(targetIndex, { autoplay: wasPlaying, seek: Math.max(0, target - accumulated) });
  }

  function seekFromPointer(event) {
    const bounds = progress.getBoundingClientRect();
    const rotated = player.classList.contains('is-rotated');
    const position = rotated
      ? (event.clientY - bounds.top) / bounds.height
      : (event.clientX - bounds.left) / bounds.width;
    progress.value = String(Math.round(Math.max(0, Math.min(1, position)) * 1000));
    seekToProgressValue();
  }

  progress.addEventListener('input', seekToProgressValue);

  progress.addEventListener('pointerdown', event => {
    isSeeking = true;
    seekingPointerId = event.pointerId;
    window.clearTimeout(controlsTimer);
    player.classList.remove('controls-hidden');
    progress.setPointerCapture?.(event.pointerId);
    seekFromPointer(event);
    event.preventDefault();
  });
  progress.addEventListener('pointermove', event => {
    if (!isSeeking || event.pointerId !== seekingPointerId) return;
    seekFromPointer(event);
    event.preventDefault();
  });
  const finishSeeking = event => {
    if (!isSeeking || event?.pointerId !== seekingPointerId) return;
    seekFromPointer(event);
    isSeeking = false;
    seekingPointerId = null;
    if (event?.pointerId !== undefined && progress.hasPointerCapture?.(event.pointerId)) {
      progress.releasePointerCapture(event.pointerId);
    }
    showVideoControls();
  };
  progress.addEventListener('pointerup', finishSeeking);
  progress.addEventListener('pointercancel', finishSeeking);

  playPause.addEventListener('click', () => togglePlayback({ allowFullscreen: true }));
  video.addEventListener('click', () => {
    if (!video.paused && !video.ended) {
      if (player.classList.contains('controls-hidden')) {
        showVideoControls();
      } else {
        window.clearTimeout(controlsTimer);
        player.classList.add('controls-hidden');
      }
      return;
    }
    togglePlayback({ allowFullscreen: true });
  });
  player.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') showVideoControls();
  });
  controls.addEventListener('pointerdown', event => {
    if (event.target !== progress) showVideoControls();
  });
  enterFullscreenButton.addEventListener('click', () => {
    enterVideoFullscreen(player);
    showVideoControls();
  });
  exitFullscreen.addEventListener('click', leaveVideoFullscreen);
  updatePlayer();
});
