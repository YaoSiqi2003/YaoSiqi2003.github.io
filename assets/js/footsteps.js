(function () {
  var dataEl = document.getElementById("footsteps-data");
  var mapEl = document.getElementById("footsteps-map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  var places = [];
  try {
    places = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }
  if (!Array.isArray(places)) return;

  places = places.filter(function (place) {
    return place && typeof place.lat === "number" && typeof place.lng === "number";
  });

  var worldBounds = L.latLngBounds([[-85.05112878, -180], [85.05112878, 180]]);
  var map = L.map(mapEl, {
    scrollWheelZoom: true,
    worldCopyJump: false,
    zoomControl: false,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2
  });
  L.control.zoom({ position: "topright" }).addTo(map);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
    noWrap: true,
    bounds: worldBounds
  }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
    attribution: "",
    maxZoom: 16,
    noWrap: true,
    bounds: worldBounds
  }).addTo(map);

  function isSafeUrl(url) {
    return /^(https?:)?\/\//i.test(url) || url.charAt(0) === "/";
  }

  function buildHoverCard(place) {
    var wrap = document.createElement("div");
    wrap.className = "footsteps-popup";

    var title = document.createElement("h3");
    title.className = "footsteps-popup__title";
    title.textContent = place.name || "Untitled place";
    wrap.appendChild(title);

    if (place.period) {
      var period = document.createElement("p");
      period.className = "footsteps-popup__period";
      period.textContent = place.period;
      wrap.appendChild(period);
    }

    if (place.note) {
      var note = document.createElement("p");
      note.className = "footsteps-popup__note";
      note.textContent = place.note;
      wrap.appendChild(note);
    }

    return wrap;
  }

  var lightbox = document.getElementById("footsteps-lightbox");
  var lightboxViewport = document.getElementById("footsteps-lightbox-viewport");
  var lightboxImage = document.getElementById("footsteps-lightbox-image");
  var lightboxBlank = document.getElementById("footsteps-lightbox-blank");
  var lightboxTitle = document.getElementById("footsteps-lightbox-title");
  var lightboxText = document.getElementById("footsteps-lightbox-text");
  var gallery = [];
  var galleryIndex = 0;
  var galleryPlace = null;
  var loadToken = 0;
  var view = { scale: 1, x: 0, y: 0, min: 1, max: 8 };
  var pointers = {};
  var pinch = null;
  var pan = null;

  function isLightboxOpen() {
    return lightbox && !lightbox.hidden;
  }

  function getPhotos(place) {
    var list = [];
    function add(src, caption) {
      if (src && isSafeUrl(src)) {
        list.push({ src: src, caption: caption || "" });
      }
    }
    if (place && Array.isArray(place.photos)) {
      place.photos.forEach(function (item) {
        if (typeof item === "string") add(item, "");
        else if (item && item.src) add(item.src, item.caption);
      });
    }
    if (!list.length && place && place.photo) add(place.photo, "");
    return list;
  }

  function applyView() {
    if (!lightboxImage) return;
    lightboxImage.style.transform =
      "translate(" + view.x + "px," + view.y + "px) scale(" + view.scale + ")";
    if (lightboxViewport) {
      lightboxViewport.classList.toggle("is-zoomed", view.scale > view.min + 0.001);
    }
  }

  function clampPan() {
    if (!lightboxViewport || !lightboxImage) return;
    var nw = lightboxImage.naturalWidth;
    var nh = lightboxImage.naturalHeight;
    if (!nw || !nh) return;
    var vw = lightboxViewport.clientWidth;
    var vh = lightboxViewport.clientHeight;
    var dw = nw * view.scale;
    var dh = nh * view.scale;
    if (dw <= vw) view.x = (vw - dw) / 2;
    else view.x = Math.min(0, Math.max(vw - dw, view.x));
    if (dh <= vh) view.y = (vh - dh) / 2;
    else view.y = Math.min(0, Math.max(vh - dh, view.y));
  }

  function fitView() {
    if (!lightboxViewport || !lightboxImage) return;
    var nw = lightboxImage.naturalWidth;
    var nh = lightboxImage.naturalHeight;
    var vw = lightboxViewport.clientWidth;
    var vh = lightboxViewport.clientHeight;
    if (!nw || !nh || !vw || !vh) return;
    view.min = Math.min(vw / nw, vh / nh);
    view.max = view.min * 8;
    view.scale = view.min;
    view.x = (vw - nw * view.scale) / 2;
    view.y = (vh - nh * view.scale) / 2;
    applyView();
  }

  function zoomAt(clientX, clientY, nextScale) {
    if (!lightboxViewport) return;
    var rect = lightboxViewport.getBoundingClientRect();
    var mx = clientX - rect.left;
    var my = clientY - rect.top;
    nextScale = Math.max(view.min, Math.min(view.max, nextScale));
    var ratio = nextScale / view.scale;
    view.x = mx - (mx - view.x) * ratio;
    view.y = my - (my - view.y) * ratio;
    view.scale = nextScale;
    if (view.scale <= view.min + 0.001) {
      fitView();
      return;
    }
    clampPan();
    applyView();
  }

  function setCaption(text) {
    if (!lightboxText) return;
    lightboxText.textContent = text || "";
    lightboxText.hidden = !text;
  }

  function showSlide() {
    var token = ++loadToken;
    var place = galleryPlace || {};
    if (!gallery.length) {
      if (lightboxImage) {
        lightboxImage.hidden = true;
        lightboxImage.removeAttribute("src");
        lightboxImage.style.transform = "";
      }
      if (lightboxBlank) lightboxBlank.hidden = false;
      setCaption(place.note || "");
      return;
    }

    var item = gallery[galleryIndex];
    if (lightboxBlank) lightboxBlank.hidden = true;
    if (!lightboxImage) return;
    lightboxImage.hidden = false;
    lightboxImage.alt = item.caption || place.name || "";
    setCaption(item.caption || place.note || "");

    function onReady() {
      if (token !== loadToken) return;
      fitView();
    }

    if (lightboxImage.getAttribute("src") === item.src && lightboxImage.complete && lightboxImage.naturalWidth) {
      onReady();
      return;
    }
    lightboxImage.onload = onReady;
    lightboxImage.src = item.src;
  }

  function stepGallery(dir) {
    if (!gallery.length) return;
    galleryIndex = (galleryIndex + dir + gallery.length) % gallery.length;
    showSlide();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.style.overflow = "";
    pointers = {};
    pinch = null;
    pan = null;
    if (lightboxViewport) lightboxViewport.classList.remove("is-zoomed", "is-panning");
    if (lightboxImage) {
      lightboxImage.onload = null;
      lightboxImage.removeAttribute("src");
      lightboxImage.hidden = true;
      lightboxImage.style.transform = "";
    }
  }

  function openLightbox(place) {
    if (!lightbox) return;
    galleryPlace = place || {};
    gallery = getPhotos(galleryPlace);
    galleryIndex = 0;
    if (lightboxTitle) lightboxTitle.textContent = galleryPlace.name || "Untitled place";
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    showSlide();
  }

  if (lightbox) {
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
  }
  var lightboxClose = document.getElementById("footsteps-lightbox-close");
  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeLightbox);
  }
  var lightboxPrev = document.getElementById("footsteps-lightbox-prev");
  var lightboxNext = document.getElementById("footsteps-lightbox-next");
  if (lightboxPrev) {
    lightboxPrev.addEventListener("click", function (event) {
      event.stopPropagation();
      stepGallery(-1);
    });
  }
  if (lightboxNext) {
    lightboxNext.addEventListener("click", function (event) {
      event.stopPropagation();
      stepGallery(1);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (!isLightboxOpen()) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepGallery(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepGallery(1);
    }
  });

  if (lightboxViewport) {
    lightboxViewport.addEventListener("wheel", function (event) {
      if (!isLightboxOpen() || lightboxImage.hidden) return;
      event.preventDefault();
      var factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(event.clientX, event.clientY, view.scale * factor);
    }, { passive: false });

    lightboxViewport.addEventListener("dblclick", function (event) {
      if (!isLightboxOpen() || lightboxImage.hidden) return;
      event.preventDefault();
      if (view.scale > view.min + 0.001) fitView();
      else zoomAt(event.clientX, event.clientY, view.min * 2.6);
    });

    lightboxViewport.addEventListener("pointerdown", function (event) {
      if (!isLightboxOpen() || lightboxImage.hidden) return;
      lightboxViewport.setPointerCapture(event.pointerId);
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        pinch = {
          dist: Math.sqrt(dx * dx + dy * dy) || 1,
          scale: view.scale,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2
        };
        pan = null;
      } else if (ids.length === 1 && view.scale > view.min + 0.001) {
        pan = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y };
        lightboxViewport.classList.add("is-panning");
      }
    });

    lightboxViewport.addEventListener("pointermove", function (event) {
      if (!pointers[event.pointerId]) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length >= 2) {
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        zoomAt(pinch.midX, pinch.midY, pinch.scale * (dist / pinch.dist));
        return;
      }
      if (pan && ids.length === 1) {
        view.x = pan.ox + (event.clientX - pan.x);
        view.y = pan.oy + (event.clientY - pan.y);
        clampPan();
        applyView();
      }
    });

    function endPointer(event) {
      delete pointers[event.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (Object.keys(pointers).length === 0) {
        pan = null;
        lightboxViewport.classList.remove("is-panning");
      }
    }

    lightboxViewport.addEventListener("pointerup", endPointer);
    lightboxViewport.addEventListener("pointercancel", endPointer);
  }

  window.addEventListener("resize", function () {
    if (!isLightboxOpen() || !lightboxImage || lightboxImage.hidden) return;
    var wasFit = view.scale <= view.min + 0.001;
    if (wasFit) fitView();
    else {
      var nw = lightboxImage.naturalWidth;
      var nh = lightboxImage.naturalHeight;
      var vw = lightboxViewport.clientWidth;
      var vh = lightboxViewport.clientHeight;
      if (!nw || !nh || !vw || !vh) return;
      view.min = Math.min(vw / nw, vh / nh);
      view.max = view.min * 8;
      if (view.scale < view.min) view.scale = view.min;
      clampPan();
      applyView();
    }
  });

  function circleStyle(kind) {
    var lived = kind === "lived";
    return {
      radius: lived ? 10 : 9,
      color: "#fff",
      weight: 3,
      opacity: 1,
      fillColor: lived ? "#52adc8" : "#4a4f54",
      fillOpacity: 1
    };
  }

  var markers = [];
  places.forEach(function (place) {
    var origin = L.latLng(place.lat, place.lng);
    var marker = L.circleMarker(origin, circleStyle(place.kind));
    marker._origin = origin;
    marker.bindTooltip(buildHoverCard(place), {
      className: "footsteps-hover",
      direction: "top",
      offset: [0, -12],
      opacity: 1,
      sticky: false,
      interactive: false
    });
    marker.on("mouseover", function () {
      this.bringToFront();
    });
    marker.on("click", function (event) {
      L.DomEvent.stopPropagation(event);
      this.closeTooltip();
      openLightbox(place);
    });
    marker.addTo(map);
    markers.push(marker);
  });

  var GOLDEN = Math.PI * (3 - Math.sqrt(5));
  var OVERLAP_PX = 18;
  var STACK_PX = 9;

  function spreadOverlaps() {
    var n = markers.length;
    if (!n) return;

    var points = markers.map(function (m) {
      return map.latLngToLayerPoint(m._origin);
    });
    var parent = [];
    for (var i = 0; i < n; i++) parent[i] = i;

    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }

    function union(a, b) {
      var pa = find(a);
      var pb = find(b);
      if (pa !== pb) parent[pa] = pb;
    }

    var limit2 = OVERLAP_PX * OVERLAP_PX;
    for (i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var dx = points[i].x - points[j].x;
        var dy = points[i].y - points[j].y;
        if (dx * dx + dy * dy < limit2) union(i, j);
      }
    }

    var groups = {};
    for (i = 0; i < n; i++) {
      var root = find(i);
      if (!groups[root]) groups[root] = [];
      groups[root].push(i);
    }

    Object.keys(groups).forEach(function (key) {
      var idxs = groups[key];
      idxs.forEach(function (idx, k) {
        var pt = points[idx];
        if (idxs.length > 1) {
          var rad = STACK_PX * Math.sqrt(k);
          var ang = k * GOLDEN + Math.PI / 6;
          pt = pt.add([rad * Math.cos(ang), rad * Math.sin(ang)]);
        }
        markers[idx].setLatLng(map.layerPointToLatLng(pt));
      });
    });
  }

  function resetView() {
    map.setView([20, 0], map.getMinZoom());
    spreadOverlaps();
  }

  map.on("zoomend", spreadOverlaps);
  resetView();
  map.whenReady(function () {
    map.invalidateSize();
    resetView();
  });

  var countEl = document.getElementById("footsteps-count");
  if (countEl) {
    var count = places.length;
    countEl.textContent = count === 1 ? "1 place" : count + " places";
  }

  var resetEl = document.getElementById("footsteps-reset");
  if (resetEl) {
    resetEl.addEventListener("click", function () {
      resetView();
    });
  }
})();
