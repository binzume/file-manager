'use strict';

/**
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tag 
 * @param {string | Node | (string|Node)[]} [children] 
 * @param {object | function} [attrs]
 * @returns {HTMLElementTagNameMap[T]}
 */
function mkEl(tag, children, attrs) {
	let el = document.createElement(tag);
	children && el.append(...[children].flat(999));
	attrs instanceof Function ? attrs(el) : (attrs && Object.assign(el, attrs));
	return el;
}

let eachElements = (q, f) => document.querySelectorAll(q).forEach(f);

function formatTime(t) {
	return '' + (t / 60 | 0) + ':' + (t % 60 | 0).toString().padStart(2, '0');
}

function formatDate(s) {
	let t = new Date(s);
	if (!s || t.getTime() <= 0) { return ''; }
	let d2 = n => (n > 9 ? '' : '0') + n;
	return [t.getFullYear(), d2(t.getMonth() + 1), d2(t.getDate())].join('-') + ' ' +
		[d2(t.getHours()), d2(t.getMinutes())].join(':');
}

function formatSize(size) {
	if (size == null) { return ''; }
	if (size > 1024 * 1024 * 1024 * 10) { return (size / (1024 * 1024 * 1024) | 0) + 'GiB'; }
	if (size > 1024 * 1024 * 10) { return (size / (1024 * 1024) | 0) + 'MiB'; }
	if (size > 1024 * 10) { return (size / (1024) | 0) + 'KiB'; }
	return size + 'B'
}

/**
 * @param {HTMLElement} el 
 */
function initPinchZoom(el, minScale = 0.5, maxScale = 8) {
	let getPinch = (/** @type {TouchEvent} */ ev) => ({
		cx: (ev.touches[0].clientX + ev.touches[1].clientX) / 2,
		cy: (ev.touches[0].clientY + ev.touches[1].clientY) / 2,
		d: Math.hypot(ev.touches[0].pageX - ev.touches[1].pageX, ev.touches[0].pageY - ev.touches[1].pageY),
	});
	let state = { dx: 0, dy: 0, scale: 1 }, last = null;
	el.addEventListener('touchstart', ev => {
		if (ev.touches.length != 2) { return; }
		ev.preventDefault();
		last = getPinch(ev);
	});
	el.addEventListener('touchmove', ev => {
		if (ev.touches.length != 2) { return; }
		ev.preventDefault();
		let rect = el.getBoundingClientRect();
		let pinch = getPinch(ev);
		let scale = Math.min(Math.max(minScale, state.scale * pinch.d / last.d), maxScale);
		let ds = 1 - scale / state.scale, hw = rect.width / 2, hh = rect.height / 2;
		state.dx = Math.min(Math.max(-hw, state.dx + (pinch.cx - rect.left - hw) * ds + pinch.cx - last.cx), hw);
		state.dy = Math.min(Math.max(-hh, state.dy + (pinch.cy - rect.top - hh) * ds + pinch.cy - last.cy), hh);
		state.scale = scale;
		el.style.transform = `translate3d(${state.dx}px, ${state.dy}px, 0) scale(${state.scale})`;
		last = pinch;
	});
	el.addEventListener('dblclick', ev => {
		state = { dx: 0, dy: 0, scale: 1 };
		el.style.transform = '';
	});
}

function setError(msg) {
	document.getElementById('error').textContent = msg ? msg : '';
}

class MediaPlayer {
	constructor(el) {
		/** @type {HTMLElement} */
		this.el = el;
		/** @type {HTMLMediaElement|null} */
		this.mediaEl = null;
		this.continuousPlay = true;
		this.muted = false;
		this.loop = false;
		this.playbackRate = 1.0;
		this.onEnded = null;
		/** @type {HTMLElement} */
		this.contentEl = el.querySelector('.media-player-content');
		window.addEventListener('popstate', ev => !this.el.classList.contains('small') && this.hide());
	}
	open(item) {
		this.el.style.display = 'block';
		this.el.classList.add('loading');
		if (!this.el.classList.contains('small')) {
			document.body.classList.add('lockscroll');
			if (history.state != 'player') {
				history.pushState('player', '');
			}
		}
		this._clearMediaEl();
		if (Array.isArray(item)) {
			let container = this.contentEl.appendChild(mkEl('div'));
			item.forEach(i => this._createEl(i, container));
		} else {
			this._createEl(item, this.contentEl);
		}
		this.contentEl.focus();
	}
	_createEl(item, parent) {
		let type = item.type.split('/', 2)[0];
		if (type == 'image') {
			this.el.classList.remove('playable');
			let content = mkEl('img', [], { src: item.url || item.path || '' });
			if (item.url == null && item.fetch) {
				(async () => {
					let url = URL.createObjectURL(await (await item.fetch()).blob());
					content.addEventListener('load', (ev) => {
						URL.revokeObjectURL(url);
					}, { once: true });
					content.src = url;
				})();
			}
			content.addEventListener('load', (ev) => {
				this.el.classList.remove('loading');
			});
			content.addEventListener('error', (ev) => {
				this.el.classList.remove('loading');
			});
			parent.append(content);
		} else {
			this.el.classList.add('playable');
			const tag = type == 'audio' ? 'audio' : 'video';
			const content = mkEl(tag, [], { controls: false, loop: this.loop, muted: this.muted, playbackRate: this.playbackRate });
			if (item.url == null && item.fetch && item.type.startsWith("video/mp4") && typeof MP4Player !== 'undefined') {
				let options = {
					opener: {
						async open(pos) { return (await item.fetch(pos)).body.getReader(); }
					}
				};
				new MP4Player(content).setBufferedReader(new BufferedReader(options));
			} else {
				content.src = item.url || item.path;
			}
			content.addEventListener('loadeddata', (ev) => {
				this.el.classList.remove('loading');
			});
			content.addEventListener('error', (ev) => {
				this.el.classList.remove('loading');
			});
			content.addEventListener('ended', (ev) => {
				if (this.onEnded) this.onEnded(this);
			});
			this.mediaEl = content;
			content.play();
			parent.append(content);
		}
	}
	playPause() {
		if (!this.mediaEl) return;
		if (!this.mediaEl.paused) {
			this.mediaEl.pause();
		} else {
			this.mediaEl.play();
		}
	}
	hide() {
		if (history.state == 'player') {
			history.back();
			return;
		}
		if (!this.el) return;
		document.body.classList.remove('lockscroll');
		this.el.style.display = 'none';
		this._clearMediaEl();
		if (this.isFullscreen()) {
			this.exitFullscreen();
		}
	}
	_clearMediaEl() {
		if (this.mediaEl && this.mediaEl.src) {
			this.mediaEl.src = '';
		}
		this.mediaEl = null;
		this.contentEl.textContent = '';
	}
	toggleSize() {
		if (this.isFullscreen()) {
			this.exitFullscreen();
			if (this.el.classList.contains('small')) {
				return;
			}
		}
		if (this.el.classList.toggle('small')) {
			document.body.classList.remove('lockscroll');
		} else {
			document.body.classList.add('lockscroll');
			if (history.state != 'player') {
				history.pushState('player', '');
			}
		}
	}
	isFullSize() {
		return this.isFullscreen() || !this.el.classList.contains('small')
	}
	fullscreen() {
		(this.el.requestFullscreen || this.el.webkitRequestFullscreen).call(this.el);
	}
	exitFullscreen() {
		(document.exitFullscreen || document.webkitExitFullscreen).call(document);
	}
	isFullscreen() {
		return (document.fullscreenElement || document.webkitFullscreenElement) == this.el;
	}
	toggleFullscreen() {
		this.isFullscreen() ? this.exitFullscreen() : this.fullscreen();
	}
	isActive() {
		return this.el.style.display == 'block';
	}
	setMuted(muted) {
		this.muted = muted;
		if (this.mediaEl) {
			this.mediaEl.muted = muted;
		}
	}
	setLoop(loop) {
		this.loop = loop;
		if (this.mediaEl) {
			this.mediaEl.loop = loop;
		}
	}
}

class FileListCursor {
	/**
	 * @param {Folder} folder 
	 * @param {object} options 
	 */
	constructor(folder, options = { sortField: 'updatedTime', sortOrder: 'd' }) {
		this._folder = folder;
		this.options = options;
		this.onselect = [];
		/** @type {(r: FilesResult)=>any} */
		this.loaded = null;
		/** @type {FileInfo[]} */
		this.items = [];
		this._pos = -1;
		this.finished = false;
		this._next = 0;
		this._ac = null;
	}
	async loadNext(moveOffset = 0) {
		if (this.finished || this._ac) {
			return;
		}
		this._ac = new AbortController();
		let signal = this._ac.signal;
		let r = await this._folder.getFiles(this._next, -1, this.options, signal);
		signal.throwIfAborted();
		this.finished = !r || r.next == null && !r.more;
		this._ac = null;
		if (r && r.items) {
			this.items = this.items.concat(r.items);
			this._next = r.next || this._next + r.items.length;
			r.items.length > 0 && moveOffset != 0 && this.moveOffset(moveOffset);
		}
		this.loaded && this.loaded(r);
	}
	current() {
		return this.items[this._pos];
	}
	peekNext(filter = null) {
		let p = this._pos + 1;
		while (this.items.length > p) {
			if (filter = null || filter(this.items[p])) {
				return this.items[p];
			}
			p++;
		}
		return null;
	}
	moveOffset(offset, filter = null) {
		let d = offset > 0 ? 1 : -1;
		while (offset != 0) {
			if (this._pos + d >= this.items.length) {
				this.loadNext(offset);
				return false;
			} else if (this._pos + d < 0) {
				return false;
			}
			this._pos += d;
			if (filter == null || filter(this.items[this._pos])) {
				offset -= d;
			}
		}
		let item = this.items[this._pos];
		item && this.onselect.forEach(cb => cb(item));
		return true;
	}
	selectItem(item) {
		let p = this.items.findIndex(i => i == item);
		if (p >= 0) {
			this._pos = p;
			this.moveOffset(0);
			return true;
		}
		return false;
	}
	dispose() {
		this._ac && this._ac.abort();
	}
}

class MediaPlayerController {
	constructor(mediaPlayer) {
		/** @type {MediaPlayer} */
		this.mediaPlayer = mediaPlayer;
		this.infoView = new ContentInfoView();
		/** @type {FileListCursor|null} */
		this.cursor = null;
		this.spreadMode = false;
		this.rtlMode = false;
		this.timeout = 0;
	}
	/**
	 * @param {MediaPlayer} mediaPlayer
	 */
	init(mediaPlayer) {
		this.mediaPlayer = mediaPlayer;
		this.infoView.init(this._el('#player-content-info'));

		mediaPlayer.contentEl.addEventListener('click', (e) => mediaPlayer.playPause());
		mediaPlayer.contentEl.addEventListener('dblclick', (e) => {
			if (!mediaPlayer.mediaEl && mediaPlayer.contentEl.style.transform == '') {
				mediaPlayer.contentEl.classList.toggle('fitscreen');
			} else {
				mediaPlayer.contentEl.classList.add('fitscreen');
			}
		});
		initPinchZoom(mediaPlayer.contentEl);

		let mouseTimeout = null;
		mediaPlayer.contentEl.addEventListener('mousemove', (e) => {
			mediaPlayer.contentEl.style.cursor = '';
			mediaPlayer.el.classList.add('pointermoving');
			clearTimeout(mouseTimeout);
			mouseTimeout = setTimeout(() => {
				mediaPlayer.el.classList.remove('pointermoving');
				mediaPlayer.contentEl.style.cursor = 'none';
			}, 1500);
		});

		mediaPlayer.onEnded = (player) => {
			if (player.continuousPlay) {
				clearTimeout(this.timeout);
				let dismiss = (ev) => {
					window.removeEventListener('click', dismiss, true);
					clearTimeout(this.timeout);
				};
				this.timeout = setTimeout(() => {
					window.removeEventListener('click', dismiss, true);
					player.mediaEl && this.next();
				}, 3000);
				window.addEventListener('click', dismiss, true);
			}
		};

		let onclick = (selector, f, preventDefault = false) => {
			for (let el of mediaPlayer.el.querySelectorAll(selector)) {
				el.addEventListener('click', (ev) => { preventDefault && ev.preventDefault(); f(); });
			}
		};

		onclick('.player-close-button', () => mediaPlayer.hide());
		onclick('.player-small-button', () => mediaPlayer.toggleSize());
		onclick('.player-spread-button', () => this.toggleSpreadMode());
		onclick('.player-fullscreen-button', () => mediaPlayer.toggleFullscreen());
		onclick('.player-b10', () => mediaPlayer.mediaEl.currentTime -= 10);
		onclick('.player-f10', () => mediaPlayer.mediaEl.currentTime += 10);

		onclick('.player-next', () => this.next(), true);
		onclick('.player-prev', () => this.prev(), true);
		onclick('.player-mute', () => {
			mediaPlayer.setMuted(!mediaPlayer.muted);
			this._el('.player-mute').checked = mediaPlayer.muted;
		});
		onclick('.player-loop', () => {
			mediaPlayer.setLoop(!mediaPlayer.loop);
			this._el('.player-loop').checked = mediaPlayer.loop;
		});

		onclick('.player-content-info-button', () => {
			if (!this.infoView.active) {
				this.infoView.setContent(this.cursor.current());
			}
			this.infoView.show(!this.infoView.active);
		});

		let rate = parseFloat(localStorage.getItem('playbackRate'));
		if (isNaN(rate)) {
			rate = 1.0;
		}
		let videoPlaybackRate = this._el('#player-playbackRate');
		let seekBar = this._el('#player-video-seek');
		let positionEl = this._el('#player-video-position');

		this.mediaPlayer.playbackRate = rate;
		this.setPlaybackRate(rate);
		videoPlaybackRate.addEventListener('change', (ev) => this.setPlaybackRate(videoPlaybackRate.value * 1), true);
		seekBar.addEventListener('change', (ev) => mediaPlayer.mediaEl.currentTime = seekBar.value);
		let lastPosition = 0;
		this.intervalTimer = setInterval(function () {
			let t = mediaPlayer.mediaEl ? mediaPlayer.mediaEl.currentTime : 0;
			if (t != lastPosition) {
				let d = mediaPlayer.mediaEl ? mediaPlayer.mediaEl.duration : 0;
				lastPosition = t;
				seekBar.value = t;
				seekBar.max = d;
				positionEl.textContent = formatTime(t) + '/' + formatTime(d);
			}
		}, 500);
	}
	setCursor(cursor) {
		if (this.cursor) {
			this.cursor.onselect = [];
		}
		this.cursor = cursor;
		cursor && cursor.onselect.push((item) => {
			let items = item;
			if (this.spreadMode && item.type.startsWith('image')) {
				let next = cursor.peekNext(this.isSupported);
				if (next && next.type.startsWith('image')) {
					items = this.rtlMode ? [next, item] : [item, next];
				}
			}
			this.mediaPlayer.open(items);

			if (this.infoView.active) {
				this.infoView.setContent(item);
			}
		});
	}
	handleKeyEvent(ev) {
		let mediaPlayer = this.mediaPlayer;
		if (!mediaPlayer.isActive()) return false;
		switch (ev.key) {
			case '?':
				this._el('.media-player-help').classList.toggle('active');
				break;
		}
		switch (ev.code) {
			case 'KeyT':
				this.toggleSpreadMode();
				return true;
			case 'ArrowRight':
				if (mediaPlayer.mediaEl && !ev.shiftKey) {
					mediaPlayer.mediaEl.currentTime += 10;
				} else {
					this.rtlMode ? this.prev() : this.next();
				}
				return true;
			case 'ArrowLeft':
				if (mediaPlayer.mediaEl && !ev.shiftKey) {
					mediaPlayer.mediaEl.currentTime -= 10;
				} else {
					this.rtlMode ? this.next() : this.prev();
				}
				return true;
			case 'ArrowUp':
				if (ev.shiftKey) {
					this.setPlaybackRate(this.mediaPlayer.playbackRate + 0.1);
					return true;
				}
				break;
			case 'ArrowDown':
				if (ev.shiftKey) {
					this.setPlaybackRate(this.mediaPlayer.playbackRate - 0.1);
					return true;
				}
				break;
			case 'Space':
				if (!ev.shiftKey) {
					mediaPlayer.playPause();
					return true;
				}
				break;
			case 'Enter':
				mediaPlayer.toggleFullscreen();
				return true;
			case 'KeyR':
				if (ev.shiftKey) {
					mediaPlayer.contentEl.classList.toggle('rotate90');
					return true;
				}
				break;
			case 'KeyZ':
				if (ev.shiftKey) {
					mediaPlayer.toggleSize();
					return true;
				}
				break;
			case 'Escape':
				mediaPlayer.hide();
				return true;
		}
		return false;
	}
	next() {
		this.cursor.moveOffset(this.spreadMode ? 2 : 1, this.isSupported);
	}
	prev() {
		this.cursor.moveOffset(this.spreadMode ? -2 : -1, this.isSupported);
	}
	isSupported(item) {
		let t = item.type.split('/')[0];
		return t == 'image' || t == 'video' || t == 'audio';
	}
	open(item, cursor = null) {
		this.infoView.show(false);
		this.setCursor(cursor);
		if (cursor == null) {
			this.mediaPlayer.open(item);
		} else if (!this.cursor.selectItem(item)) {
			cursor.moveOffset(1, this.isSupported);
		}
	}
	toggleSpreadMode() {
		this.spreadMode = !this.spreadMode;
		this.cursor.moveOffset(0, this.isSupported);
	}
	setPlaybackRate(rate) {
		if (this.mediaPlayer.playbackRate != rate) {
			localStorage.setItem('playbackRate', '' + rate);
		}
		this.mediaPlayer.playbackRate = rate;
		if (this.mediaPlayer.mediaEl) {
			this.mediaPlayer.mediaEl.playbackRate = rate;
		}
		this._el('#player-playbackRate').value = rate;
		this._el('#player-playbackRate-label').textContent = 'x' + rate.toFixed(1);
	}
	dispose() {
		clearInterval(this.intervalTimer);
	}
	/** @returns {HTMLElement&{[k:string]:unknown}} */
	_el(selector) {
		return this.mediaPlayer.el.querySelector(selector);
	}
}

class ImageLoadQueue {
	constructor(limit) {
		this.limit = limit;
		this.queue = [];
		this.loading = [];
	}
	add(el, loadFunc) {
		let ent = { el: el, load: loadFunc };
		this.queue.length < 100 ? this.queue.unshift(ent) : this.queue.push(ent);
		this._checkQueue();
	}
	clear() {
		this.queue = [];
	}
	async _load(ent) {
		this.loading.push(ent);
		let listener = (_ev) => {
			this.loading = this.loading.filter(t => t !== ent);
			this._checkQueue();
		};
		ent.el.addEventListener('error', listener, { once: true });
		ent.el.addEventListener('load', listener, { once: true });
		try { await ent.load(ent.el); } catch (e) { listener(null); }
	}
	_checkQueue() {
		if (this.queue.length > 0 && this.loading.length < this.limit) {
			this._load(this.queue.pop());
		}
	}
}

class ContentInfoView {
	constructor(el) {
		this.active = false;
		if (el) this.init(el);
	}
	init(el) {
		this.el = el;
		this.nameEl = el.querySelector('.name');
		/** @type {HTMLElement} */
		this.contentEl = el.querySelector('.content');
		el.querySelector('.close-button').addEventListener('click', (e) => {
			e.preventDefault();
			this.show(false);
		});
	}
	show(active) {
		this.active = active;
		if (active) {
			this.el.classList.add('active');
		} else {
			this.el.classList.remove('active');
		}
	}
	setContent(content) {
		let tags = (content.tags || []).map(function (t) { return mkEl('a', t, { href: '#list:tags/' + t }) });
		this.nameEl.textContent = content.name;
		this.contentEl.textContent = '';
		this.contentEl.append(
			mkEl('div', 'Size: ' + formatSize(content.size), { title: content.size, className: 'fileattr' }),
			mkEl('div', 'Type: ' + content.type, { className: 'fileattr' }),
			mkEl('div', 'Date: ' + formatDate(content.updatedTime), { className: 'fileattr' }),
			mkEl('div', tags, { className: 'tags' })
		);
	}
	setItems(items) {
		let sizeSum = 0;
		this.nameEl.textContent = `Selecting ${items.length} files`;
		this.contentEl.textContent = '';
		for (let item of items) {
			sizeSum += item.finfo?.size ?? 0;
		}
		this.contentEl.append(
			mkEl('div', 'Size: ' + formatSize(sizeSum), { title: sizeSum, className: 'fileattr' })
		);
	}
}

let mediaPlayerController = new MediaPlayerController();

function openItem(item, cursor = null, action = null) {
	if (mediaPlayerController.isSupported(item)) {
		mediaPlayerController.open(item, cursor);
		return true;
	} else if (item.type == 'folder' || item.type == 'archive' || item.type == 'list') {
		if (action == 'play') {
			mediaPlayerController.open(item, cursor);
		} else {
			location.href = '#list:' + encodeURIComponent(item.path).replace('%2F', '/');
		}
		return true;
	}
	return false;
}

class SideMenuListView {
	constructor(el) {
		this.el = el;
		this.items = [];
		eachElements('#menu-sort-popup button', (el) => {
			el.addEventListener('click', (ev) => {
				ev.preventDefault();
				let sort = ev.currentTarget.dataset.sortOrder.split(',');
				this.setSort(sort[0], sort[1]);
			});
		});
	}
	loadItems(folder) {
		folder.getFiles(0, undefined, {}, new AbortController().signal).then((result) => {
			if (result && result.items) {
				let field = 'updatedTime';
				let items = result.items.sort(function (a, b) { return a[field] == b[field] ? 0 : (a[field] > b[field] ? 1 : -1) * -1 });
				this.updateItems(items);
			} else {
				setError('Error');
			}
		});
	}
	setSort(field, order) {
		let sign = order == 'a' ? 1 : -1;
		let items = this.items.sort(function (a, b) { return a[field] == b[field] ? 0 : (a[field] > b[field] ? 1 : -1) * sign });
		this.updateItems(items);
	}
	updateItems(items) {
		let listEl = this.el;
		this.items = items;
		listEl.textContent = '';
		let now = new Date().getTime();
		for (let item of items) {
			let link = '#list:' + encodeURIComponent(item.path).replace('%2F', '/');
			let li = mkEl('li', mkEl('a', [item.name || '', item.itemCount ? mkEl('span', '' + item.itemCount, { className: 'count' }) : ''], { href: link }));
			let diff = now - (new Date(item.updatedTime)).getTime();
			li.className = (diff < 86400000 ? 'update1d' : (diff < 86400000 * 7 ? 'update1w' : ''));
			if (item.type != 'folder' && item.type != 'list') {
				li.addEventListener('click', (ev) => {
					if (openItem(item)) {
						ev.preventDefault();
					}
				});
			}
			if (item.remove) {
				let deleteButton = mkEl('button', 'X', { className: 'delete-button', title: 'Delete' });
				deleteButton.addEventListener('click', async (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					await item.remove();
					listEl.removeChild(li);
				});
				li.appendChild(deleteButton);
			}
			listEl.appendChild(li);
		}
	}
}

class FileListView {
	/**
	 * @param {FolderResolver} folderResolver 
	 */
	constructor(folderResolver) {
		this.el = document.getElementById('main-pane');
		this.listEl = document.getElementById('item-list');
		this.titleEl = document.getElementById('item-list-title');

		this.infoView = new ContentInfoView();
		this.infoView.init(document.getElementById('file-info'));

		this.imageLoadQueue = new ImageLoadQueue(4);
		this.folderResolver = folderResolver;
		this.listCursor = new FileListCursor(null);
		this.currentItemEl = null;
		this._selectOffset = 0;

		let onclick = (selector, f) => {
			for (let el of document.querySelectorAll(selector)) {
				el.addEventListener('click', (ev) => { ev.preventDefault(); f(ev, el); });
			}
		};
		onclick('#sort-order-list button', (ev, el) => {
			this.listCursor.options.sortField = ev.currentTarget.dataset.sortOrder;
			document.getElementById('item-sort-label').textContent = ev.currentTarget.textContent;
			this._refreshItems();
		});
		onclick('#item-sort-order-button', (ev, el) => {
			this.listCursor.options.sortOrder = this.listCursor.options.sortOrder == 'a' ? 'd' : 'a';
			el.textContent = this.listCursor.options.sortOrder == 'a' ? '\u{2191}' : '\u{2193}';
			this._refreshItems();
		});
		let setClipboard = (ev, mode) => {
			let contents = JSON.stringify({ mode: ev.type, srcPath: this._getCurrentFolder()?.path }) + "\n";;
			for (let el of this._getSelected()) {
				contents += (el.finfo.path || el.finfo.url) + "\n";
			}
			ev.clipboardData.setData('text/plain', contents);
			ev.preventDefault();
		};
		this.el.addEventListener('copy', ev => setClipboard(ev));
		this.el.addEventListener('cut', ev => setClipboard(ev));
		this.el.addEventListener('paste', async ev => {
			let lines = ev.clipboardData.getData('text/plain').trim().split("\n");
			if (lines.length < 2 || !lines[0].startsWith('{')) {
				return;
			}
			let action = JSON.parse(lines[0])
			ev.preventDefault();
			let folder = this._getCurrentFolder();
			if (folder == null || !folder.caps?.includes('transfer') || folder.path == action.srcPath) {
				alert('Cannot copy files');
				return;
			}
			let transferMode = action.mode == 'cut' ? 'move' : 'copy';
			for (let path of lines.slice(1)) {
				await folder.transferFiles([path], transferMode);
			}
		});

		let localConfig = {};
		try {
			localConfig = JSON.parse(localStorage.getItem('localConfig') || '{}');
		} catch (e) {
			// ignore
		}

		if (localConfig.listMode) {
			this.listEl.classList.remove('grid');
			this.listEl.classList.add('simple');
		}
		document.getElementById('item-list-mode-button').addEventListener('click', (ev) => {
			this.listEl.classList.toggle('grid');
			this.listEl.classList.toggle('simple');
			localConfig.listMode = this.listEl.classList.contains('simple');
			document.getElementById('item-list-mode-button').textContent = localConfig.listMode ? 'view_module' : 'view_list';
			localStorage.setItem('localConfig', JSON.stringify(localConfig));
		});

		let savedScrollTop = 0;
		this.scrollTop = 0;
		document.addEventListener('fullscreenchange', ev => {
			if (document.fullscreenElement) {
				savedScrollTop = this.scrollTop;
			} else {
				let elem = document.scrollingElement || document.body;
				elem.scrollTop = savedScrollTop;
			}
		}, false);
		this.el.addEventListener('dragover', ev => {
			if (this.getCurrentFolder()?.caps?.includes('writeFile')) {
				ev.preventDefault();
			}
		});
		this.el.addEventListener('drop', ev => {
			ev.preventDefault();
			let tasks = [];
			for (let file of ev.dataTransfer.files) {
				tasks.push(this.getCurrentFolder().writeFile(file.name, file));
			}
			Promise.all(tasks).then(() => this._refreshItems());
		});

	}

	_getCurrentFolder() {
		return this.listCursor._folder;
	}

	checkScroll() {
		let elem = document.scrollingElement || document.body;
		if (!document.fullscreenElement) {
			this.scrollTop = elem.scrollTop;
		}
		if (elem.scrollHeight - (window.innerHeight + elem.scrollTop) <= 200) {
			if (!this.listCursor.finished) {
				this.el.classList.add('loading');
				this.listCursor.loadNext();
			}
		}
	}

	selectList(path) {
		this.infoView.show(false);
		let listTitleEl = this.titleEl;
		listTitleEl.textContent = '';
		let pp = '';
		let dirs = this.folderResolver.parsePath(path);
		let name = dirs.pop();
		dirs.forEach(function (p) {
			pp += p[0];
			listTitleEl.appendChild(mkEl('a', p[1] || p[0], { href: '#list:' + pp }));
			listTitleEl.appendChild(document.createTextNode('>'));
			pp += '/';
		});
		listTitleEl.appendChild(mkEl('span', name[1] || name[0]));
		this.path = path;
		this._refreshItems();
	}

	_refreshItems() {
		setError(null);
		this.listEl.textContent = '';
		this.imageLoadQueue.clear();
		this.listCursor.dispose();
		let folder = this.folderResolver.getFolder(this.path, '');
		this.listCursor = new FileListCursor(folder, this.listCursor.options);
		let m = decodeURIComponent(location.hash.slice(1)).match(/pos:([^&#]+)/);
		if (m) {
			this.listCursor._next = +m[1];
		}
		this.el.classList.add('loading');
		this.listCursor.loaded = r => this._onGetItemsResult(r);
		this.listCursor.loadNext();
	}

	_onGetItemsResult(result) {
		this.el.classList.remove('loading');
		if (!result || result.items == null) {
			setError('Failed to load file list.');
			return;
		}
		if (result.name) {
			let links = this.titleEl.querySelectorAll('A,SPAN');
			if (links.length == 1) {
				links[links.length - 1].textContent = result.name;
			}
		}

		let list = this.listEl;
		for (let i = 0; i < result.items.length; i++) {
			list.appendChild(this._createItemEl(result.items[i], result.name));
		}
		this.checkScroll();
	}

	_confirmAndRemoveAll(itemEls) {
		if (itemEls.length > 0 && confirm(itemEls.length > 1 ? `Remove ${itemEls.length} files?` : `Remove ${itemEls[0].finfo.name}?`)) {
			this.currentItemEl = itemEls[itemEls.length - 1].nextElementSibling || itemEls[0].previousElementSibling;
			for (let itemEl of itemEls) {
				itemEl.finfo.remove();
				itemEl.parentNode.removeChild(itemEl);
			}
		}
	}

	_createItemEl(f, prefix) {
		let iconEl = mkEl('img', [], { 'className': 'thumbnail' });
		let isList = f.type == 'folder' || f.type == 'list';
		if (f.thumbnail && f.thumbnail.fetch) {
			this.imageLoadQueue.add(iconEl, async el => {
				let url = URL.createObjectURL(await (await f.thumbnail.fetch()).blob());
				el.addEventListener('load', ev => URL.revokeObjectURL(url), { once: true });
				el.src = url;
			});
		} else {
			let turl = f.thumbnailUrl || (isList ? 'images/icon_folder.svg' : 'images/icon_file.svg');
			this.imageLoadQueue.add(iconEl, el => el.src = turl);
		}

		let url = f.type == 'folder' ? '#list:' + encodeURIComponent(f.path).replace('%2F', '/') : f.url;
		let thumbLink = mkEl('a', iconEl, { 'title': f.name, 'href': url || f.path });
		let shortName = (prefix && f.name.startsWith(prefix)) ? f.name.substr(prefix.length).trim() : f.name;
		let openLink = mkEl('a', shortName, { 'title': f.name, 'href': url || f.path, 'className': 'openLink', tabIndex: -1 });
		let date = mkEl('span', formatDate(f.updatedTime), { className: 'date' });
		let downloadBlob = (ev) => {
			ev.preventDefault();
			(async () => {
				let url = URL.createObjectURL(await (await f.fetch()).blob());
				el.appendChild(mkEl('a', '', { target: '_blank', href: url, download: f.name, style: 'display:none;' })).click();
				URL.revokeObjectURL(url);
			})();
		};
		let onclick = (ev) => {
			if (this.infoView.active || ev.ctrlKey) {
				ev.preventDefault();
				el.classList.toggle('selected');
				this._updateSelection();
				return;
			}
			this.currentItemEl = el;
			if (!isList && openItem(f, this._getCursorToPlay(f), 'play')) {
				ev.preventDefault();
			} else if (!f.url && f.fetch) {
				downloadBlob(ev);
			}
		};
		if (!isList) {
			thumbLink.target = '_blank';
			openLink.target = '_blank';
		}
		thumbLink.onclick = onclick;
		openLink.onclick = onclick;
		let el = mkEl('li', [thumbLink, date, openLink], { finfo: f });
		if (!f.type.startsWith('link/')) {
			let optionButton = mkEl('button', '\u{22EE}', { className: 'option-button rounded-button' });
			el.append(optionButton);
			el.oncontextmenu = ev => { optionButton.click(); ev.preventDefault(); };
			optionButton.addEventListener('click', (ev) => {
				ev.preventDefault();

				let rect = ev.currentTarget.getBoundingClientRect();
				let menuEl = this._createContextMenuEl(f, el, isList);
				menuEl.style.top = rect.top;
				menuEl.style.left = 'min( ' + rect.left + 'px , calc(100vw - 120pt))';
				document.body.appendChild(menuEl);
				setTimeout(function () {
					menuEl.classList.add('active');
					window.addEventListener('click', function dismiss(ev) {
						window.removeEventListener('click', dismiss, false);
						document.body.removeChild(menuEl);
					}, false);
				}, 1);
			});
		}

		return el;
	}

	_getCursorToPlay(item) {
		if (item.type == 'folder' || item.type == 'archive' || item.type == 'list') {
			let folder = this.folderResolver.getFolder(item.path, '');
			return new FileListCursor(folder, { sortField: 'name', sortOrder: 'a' });
		}
		return this.listCursor;
	}

	_createContextMenuEl(f, el, isList) {
		let menuEl = mkEl('ul', [], { className: 'popup' });
		if (isList || f.type == 'archive') {
			let play = (ev) => openItem(f, this._getCursorToPlay(f), 'play');
			let url = '#list:' + encodeURIComponent(f.path).replace('%2F', '/');
			menuEl.append(mkEl('li', mkEl('a', 'Browse', { 'href': url, 'title': 'Browse' })));
			menuEl.append(mkEl('li', mkEl('button', 'Play Files', { onclick: play })));
		}
		if (!isList && !f.type.startsWith('link/')) {
			let dlEl = mkEl('a', 'Download', { 'target': '_blank', 'href': f.url, download: f.name, 'title': 'Download' });
			if (!f.url && f.fetch) { dlEl.onclick = downloadBlob; }
			menuEl.append(mkEl('li', dlEl));
		}
		if (f.remove) {
			menuEl.append(mkEl('li', mkEl('button', 'Delete', {
				onclick: () => this._confirmAndRemoveAll([el])
			})));
		}
		if (f.rename) {
			menuEl.append(mkEl('li', mkEl('button', 'Rename', {
				onclick: async () => {
					let name = prompt('Rename', f.name);
					if (name && name != f.name) {
						f.rename(name).then(_ => this._refreshItems());
					}
				}
			})));
		}
		menuEl.append(mkEl('li', mkEl('button', 'Select', {
			onclick: () => {
				this.clearSelection();
				el.classList.add('selected');
				this._selectOffset = 0;
				this._updateSelection();
			}
		})));
		return menuEl;
	}

	clearSelection() {
		this.infoView.show(false);
		this._selectOffset = 0;
		for (let el of this._getSelected()) {
			el.classList.remove('selected');
		}
	}

	_getSelected() {
		return this.listEl.querySelectorAll(':scope > .selected, :scope > :focus-within');
	}

	_updateSelection() {
		let selected = this._getSelected();
		this.infoView.show(selected.length > 0);
		if (selected.length == 1) {
			this.infoView.setContent(selected[0].finfo);
		} else if (selected.length > 1) {
			this.infoView.setItems(selected);
		}
	}

	handleKeyEvent(/** @type {KeyboardEvent} */ ev) {
		if (ev.code == 'KeyS' && ev.shiftKey) {
			this.listCursor.options.sortOrder = this.listCursor.options.sortOrder == 'd' ? 'a' : 'd';
			this._refreshItems();
			return true;
		}
		if (ev.altKey) {
			if (ev.code == 'ArrowUp') {
				let dirs = this.titleEl.querySelectorAll('a');
				if (dirs.length > 0) {
					location.href = dirs[dirs.length - 1].href;
					return true;
				}
			}
			return false;
		} else if (ev.code == 'Delete' && this._getCurrentFolder()?.caps?.includes('remove')) {
			let selected = this._getSelected();
			if (selected.length > 0) {
				this._confirmAndRemoveAll(selected);
			} else {
				let el = this.listEl.querySelector(':scope > :focus-within');
				if (el) {
					this._confirmAndRemoveAll([el]);
				}
			}
			return true;
		} else if (ev.code == 'KeyX' && !ev.ctrlKey) {
			let el = this.listEl.querySelector(':scope > :focus-within');
			// el.querySelector('a,button').focus();
			el.classList.toggle('selected');
			this._selectOffset = 0;
			this._updateSelection();
			return true;
		} else if (ev.code == 'F2') {
			let f = this.listEl.querySelector(':scope > :focus-within')?.finfo;
			if (f?.rename) {
				let name = prompt('Rename', f.name);
				if (name && name != f.name) {
					f.rename(name).then(_ => this._refreshItems());
				}
			}
		} else if (ev.code == 'Home') {
			this.listEl.firstElementChild?.querySelector('a,button')?.focus();
		} else if (ev.code == 'End') {
			this.listEl.lastElementChild?.querySelector('a,button')?.focus();
		} else if (ev.code == 'Escape') {
			this.clearSelection();
			return true;
		}

		let dx = 0, dy = 0;
		if (ev.code == 'ArrowDown') {
			dy = 1;
		} else if (ev.code == 'ArrowUp') {
			dy = -1;
		} else if (ev.code == 'ArrowRight') {
			dx = 1;
		} else if (ev.code == 'ArrowLeft') {
			dx = -1;
		}
		if (dx || dy) {
			let cols = getComputedStyle(this.listEl).getPropertyValue("grid-template-columns").split(' ').length;
			let el = this.listEl.querySelector(':focus-within') || this.currentItemEl;
			if (el == null || el.parentNode == null) {
				el = this.listEl.firstElementChild;
			} else {
				let d = dy * cols + dx;
				while (d > 0 && el) {
					if (ev.shiftKey) {
						if (this._selectOffset >= 0) {
							el.classList.add('selected');
						} else {
							el.classList.remove('selected');
						}
						this._selectOffset++;
					}
					d--;
					el = el.nextElementSibling;
				}
				while (d < 0 && el) {
					if (ev.shiftKey) {
						if (this._selectOffset <= 0) {
							el.classList.add('selected');
						} else {
							el.classList.remove('selected');
						}
						this._selectOffset--;
					}
					d++;
					el = el.previousElementSibling;
				}
			}
			if (!ev.shiftKey) {
				!this._selectOffset || ev.ctrlKey || this.clearSelection();
			} else if (el) {
				el.classList.add('selected');
				this._updateSelection();
			}
			if (el != null) {
				el.querySelector('a,button').focus();
				this.currentItemEl = el;
				return true;
			}
		}
		return false;
	}
}

const defaultListPath = '';
const sideMenuListPath = '';

class FileListLoader {
	constructor(path) {
		this.path = path;
		this.caps = [];
	}
	async getFiles(offset, limit, options, signal = null) {
		let res = await window.go.main.App.GetFiles(this.path || "", offset, limit || -1);
		this.caps = res.folder.caps || [];
		console.log(this.caps);
		let canRemove = this.caps.includes('remove')
		for (let item of res.items) {
			item.path = item.path || ((this.path ? this.path + "/" : '') + item.name)
			if (canRemove) {
				item.remove = () => window.go.main.App.Remove(item.path);
			}
		}
		return res
	}
	async transferFiles(files, mode = '', signal = null) {
		await window.go.main.App.TransferFiles(this.path || ".", files, mode);
	}
	async mkdir(path) {
		return await window.go.main.App.Remove(path);
	}
}

function search(text, targets) {
	let normalize = function (s) {
		return s.replace(/[\s　]+/, '').replace(/[－?―]/g, '-').replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
			return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
		}).toLowerCase();
	};
	text = normalize(text);
	if (text == '') return [];
	let foundPrefix = [];
	let found = [];
	for (let items of targets) {
		for (let i = 0; i < items.length; i++) {
			let t = items[i];
			let name = normalize(t.name);
			let pos = name.indexOf(text);
			if (pos == 0) {
				foundPrefix.push(t);
			} else if (pos > 0) {
				found.push(t);
			}
		}
	}
	return foundPrefix.concat(found);
}

function updateSearchResult(items) {
	let searchListEl = document.getElementById('search_list');
	searchListEl.textContent = '';
	for (let item of items) {
		let label = item.name + (item.itemCount ? '(' + item.itemCount + ')' : '');
		let link = mkEl('a', label, { href: '#list:' + item.path });
		link.onclick = function (e) {
			if (openItem(item)) {
				e.preventDefault();
			}
		};
		searchListEl.appendChild(mkEl('li', link));
	}
	if (items.length > 0) {
		searchListEl.classList.add('active');
	} else {
		searchListEl.classList.remove('active');
	}
}

window.addEventListener('DOMContentLoaded', (function (e) {
	// Media player
	let mediaPlayer = new MediaPlayer(document.getElementById('embed_player'));
	mediaPlayerController.init(mediaPlayer);
	let fileListView = new FileListView(globalThis.folderResolver || {
		getFolder: (path, prefix) => new FileListLoader(path || defaultListPath),
		parsePath: (path) => path.startsWith('tags/') ? [[path.substring(4)]] : path.split('/').map(p => [p]),
	});

	function checkUrlFragment() {
		document.getElementById('menu-pane').classList.remove('override_menu_visible');
		eachElements('.replaceUrlHash', el => {
			el.href = el.href.replace(/#[^#]*$/, location.hash);
		});
		let fragment = decodeURIComponent(location.hash.slice(1));
		let m = fragment.match(/list:(.*)/)
		if (m) {
			fileListView.selectList(m[1]);
			if (mediaPlayer.isFullSize()) {
				mediaPlayer.hide();
			}
			return true;
		} else {
			fileListView.selectList('');
		}
		return false;
	}

	checkUrlFragment();

	window.addEventListener('hashchange', (function (e) {
		e.preventDefault();
		checkUrlFragment();
		// document.getElementById('search_list').classList.remove('active');
	}), false);

	// load more files.
	window.addEventListener('scroll', (function (e) {
		fileListView.checkScroll();
	}), false);
	window.addEventListener('resize', (function (e) {
		fileListView.checkScroll();
	}), false);

	// Side menu
	let sideMenuListView = new SideMenuListView(document.getElementById('tag_list'));
	sideMenuListView.loadItems(globalThis.folderResolver ? globalThis.folderResolver.getFolder('', '') : new FileListLoader(sideMenuListPath));

	// Popup menu
	let initPopup = function (buttonId, popupId, className) {
		let popup = document.getElementById(popupId);
		document.getElementById(buttonId).addEventListener('click', (ev) => {
			popup.classList.toggle(className);
			if (popup.classList.contains(className)) {
				setTimeout(function () {
					window.addEventListener('click', function dismiss(ev) {
						window.removeEventListener('click', dismiss, false);
						if (popup.classList.contains(className)) {
							popup.classList.remove(className);
						}
					}, false);
				}, 1);
			}
		});
	};
	//initPopup('menu-button', 'menu-pane', 'override_menu_visible');
	//initPopup('option-menu-button', 'option-menu', 'active');
	initPopup('item-sort-button', 'sort-order-list', 'active');
	initPopup('menu-sort-button', 'menu-sort-popup', 'active');
	eachElements('#menu-hide-toggle', (el) => {
		el.addEventListener('click', (ev) => {
			ev.preventDefault();
			this.document.body.classList.toggle('override-menu-hidden');
		});
	});

	// Search
	let searchTimeout = null;
	let searchInputEl = /** @type {HTMLInputElement} */(document.getElementById('search_keyword'));
	/*
	searchInputEl.addEventListener('input', function (ev) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(function () {
			updateSearchResult(search(searchInputEl.value, [sideMenuListView.items, fileListView.listCursor.items || []]));
		}, 300);
	});
	searchInputEl.addEventListener('focusin', function (ev) {
		searchTimeout = setTimeout(function () {
			updateSearchResult(search(searchInputEl.value, [sideMenuListView.items, fileListView.listCursor.items || []]));
		}, 300);
	});
	searchInputEl.addEventListener('focusout', function (ev) {
		searchTimeout = setTimeout(function () {
			updateSearchResult([]);
		}, 300);
	});
	document.forms['search'].addEventListener('submit', (function (e) {
		let q = searchInputEl.value;
		fileListView.selectList('tags/' + q);
		document.getElementById('search_list').classList.remove('active');
		location.href = '#q:' + q;
		e.preventDefault();
	}), false);
	*/

	// Key event
	document.addEventListener('keydown', (function (ev) {
		if (mediaPlayerController.handleKeyEvent(ev) || fileListView.handleKeyEvent(ev)) {
			ev.preventDefault();
		}
	}));
}));
