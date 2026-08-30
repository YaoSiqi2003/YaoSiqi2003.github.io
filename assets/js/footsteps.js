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
  var lightboxImage = document.getElementById("footsteps-lightbox-image");
  var lightboxBlank = document.getElementById("footsteps-lightbox-blank");
  var lightboxTitle = document.getElementById("footsteps-lightbox-title");
  var lightboxText = document.getElementById("footsteps-lightbox-text");

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.style.overflow = "";
    if (lightboxImage) {
      lightboxImage.removeAttribute("src");
      lightboxImage.hidden = true;
    }
  }

  function openLightbox(place) {
    if (!lightbox) return;
    lightboxTitle.textContent = place.name || "Untitled place";
    lightboxText.textContent = place.note || "";
    lightboxText.hidden = !place.note;

    var hasPhoto = place.photo && isSafeUrl(place.photo);
    if (hasPhoto) {
      lightboxImage.hidden = false;
      lightboxImage.src = place.photo;
      lightboxImage.alt = place.name || "";
      lightboxBlank.hidden = true;
    } else {
      lightboxImage.hidden = true;
      lightboxImage.removeAttribute("src");
      lightboxImage.alt = "";
      lightboxBlank.hidden = false;
    }

    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
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
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && lightbox && !lightbox.hidden) closeLightbox();
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
