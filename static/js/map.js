// ── TOKEN & CONFIG ────────────────────────────────────────────────────────────
mapboxgl.accessToken = 'pk.eyJ1Ijoib2N0b3JhbWFkaGFuMDUiLCJhIjoiY21xdzZwa2ZzMThncDJxcXlneHEyajVyNyJ9.I9hn4Rlo3Bp7c3v-0BKuzg';

const STYLES = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  streets:   'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  outdoors:  'mapbox://styles/mapbox/outdoors-v12'
};

const CENTER = [110.83, -7.63];
const ZOOM   = 11;

const COLORS = {
  sekolah:       '#3498db',
  puskesmas:     '#2ecc71',
  rumah_sakit:   '#e67e22',
  tempat_ibadah: '#9b59b6',
  pasar:         '#f1c40f',
  polisi:        '#34495e'
};

// Warna per layer administrasi
const ADMIN_CFG = {
  kabkota: { file:'KabKota.geojson', color:'#e74c3c', nameField:'NAMOBJ',  lineW:2.5 },
  kec:     { file:'Kec.geojson',     color:'#9b59b6', nameField:'WADMKC',  lineW:1.5 },
  desa:    { file:'DesaKel.geojson', color:'#3498db', nameField:'WADMKD',  lineW:0.7 }
};

// ── INIT MAP ──────────────────────────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: STYLES.dark,
  center: CENTER,
  zoom: ZOOM,
  antialias: true
});

map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

// ── STATE ─────────────────────────────────────────────────────────────────────
let activeType    = '';
let activeSearch  = '';
let activeKec     = '';
let activeKabkota = '';
let activeDesa    = ''; 
let allFeatures   = [];
let userMarker    = null;
let nearestMarker = null;
let routeLine     = false;
let popup         = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '280px' });

// Track hoveredId per layer
const hoveredId = { kabkota: null, kec: null, desa: null };

// ── HAVERSINE ─────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── POINT-IN-POLYGON ──────────────────────────────────────────────────────────
function pointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  const coords = polygon[0];
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function pointInFeature(point, feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') return pointInPolygon(point, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(poly => pointInPolygon(point, poly));
  return false;
}

// ── LOAD FACILITIES ───────────────────────────────────────────────────────────
function loadFacilities() {
  const params = new URLSearchParams();
  if (activeType)   params.set('type', activeType);
  if (activeSearch) params.set('search', activeSearch);

  fetch('/api/facilities?' + params)
    .then(r => r.json())
    .then(geojson => {
      let features = geojson.features;
      if (activeDesa) {
        fetch('/static/data/DesaKel.geojson').then(r => r.json()).then(desaData => {
          const target = desaData.features.find(f => f.properties.WADMKD === activeDesa);
          if (target) features = features.filter(f => pointInFeature(f.geometry.coordinates, target));
          renderFacilities(features);
        });
        return;
      } else if (activeKec) {
        fetch('/static/data/Kec.geojson').then(r => r.json()).then(kecData => {
          const target = kecData.features.find(f => f.properties.WADMKC === activeKec);
          if (target) features = features.filter(f => pointInFeature(f.geometry.coordinates, target));
          renderFacilities(features);
        });
        return;
      } else if (activeKabkota) {
        fetch('/static/data/KabKota.geojson').then(r => r.json()).then(kabData => {
          const target = kabData.features.find(f => f.properties.NAMOBJ === activeKabkota || f.properties.WADMKK === activeKabkota);
          if (target) features = features.filter(f => pointInFeature(f.geometry.coordinates, target));
          renderFacilities(features);
        });
        return;
      }
      renderFacilities(features);
    });
}

function renderFacilities(features) {
  allFeatures = features;
  updateStats(features);
  
  const geojson = { type: 'FeatureCollection', features };
  
  if (map.getSource('facilities')) {
    map.getSource('facilities').setData(geojson);
  } else {
    map.addSource('facilities', { type: 'geojson', data: geojson, cluster: true, clusterMaxZoom: 13, clusterRadius: 40 });
    
    map.addLayer({ id:'clusters', type:'circle', source:'facilities', filter:['has','point_count'],
      paint: {
        'circle-color': ['step',['get','point_count'],'#51bbd6',10,'#f1f075',30,'#f28cb1'],
        'circle-radius': ['step',['get','point_count'],18,10,24,30,30],
        'circle-opacity': 0.85, 'circle-stroke-width':2, 'circle-stroke-color':'#fff'
      }
    });
    
    map.addLayer({ id:'cluster-count', type:'symbol', source:'facilities', filter:['has','point_count'],
      layout: { 'text-field':'{point_count_abbreviated}', 'text-size':13, 'text-font':['DIN Offc Pro Medium','Arial Unicode MS Bold'] },
      paint: { 'text-color':'#fff' }
    });
    
    map.addLayer({ id:'facilities-point', type:'circle', source:'facilities', filter:['!',['has','point_count']],
      paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'],10,6,14,10],
        'circle-color': [
          'match',['get','type'],
          'sekolah', COLORS.sekolah,
          'puskesmas', COLORS.puskesmas,
          'rumah_sakit', COLORS.rumah_sakit,
          'tempat_ibadah', COLORS.tempat_ibadah,
          'pasar', COLORS.pasar,
          'polisi', COLORS.polisi,
          '#888' // default warna
        ],
        'circle-stroke-width':2, 'circle-stroke-color':'#fff', 'circle-opacity':0.92
      }
    });
    
    map.addLayer({ id:'facilities-label', type:'symbol', source:'facilities', filter:['!',['has','point_count']],
      layout: { 'text-field':['get','name'], 'text-size':11, 'text-offset':[0,1.2], 'text-anchor':'top',
        'text-font':['DIN Offc Pro Regular','Arial Unicode MS Regular'], 'text-optional':true },
      paint: { 'text-color':'#fff', 'text-halo-color':'rgba(0,0,0,0.7)', 'text-halo-width':1.5 }
    });
    
    map.on('click','clusters', e => {
      const f = map.queryRenderedFeatures(e.point, {layers:['clusters']});
      map.getSource('facilities').getClusterExpansionZoom(f[0].properties.cluster_id, (err,zoom) => {
        if (!err) map.easeTo({center: f[0].geometry.coordinates, zoom});
      });
    });
    
    map.on('mouseenter','facilities-point', e => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();
      popup.setLngLat(coords).setHTML(`
        <div class="popup-inner">
          <div class="popup-title">${p.name}</div>
          <div class="popup-badge" style="background:${COLORS[p.type]}22; color:${COLORS[p.type]}">${p.type.replace('_',' ')}</div>
          ${p.address ? `<div class="popup-address">📍 ${p.address}</div>` : ''}
          ${p.description ? `<div class="popup-desc">${p.description}</div>` : ''}
        </div>`).addTo(map);
    });
    
    map.on('mouseleave','facilities-point', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    // Klik marker fasilitas
    map.on('click', 'facilities-point', (e) => {
        const feature = e.features[0];
        const p = feature.properties;
        const coords = feature.geometry.coordinates.slice();

        new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: true
        })
        .setLngLat(coords)
        .setHTML(`
            <div class="popup-inner">
                <div class="popup-title">${p.name}</div>
                <div class="popup-badge"
                    style="background:${COLORS[p.type]}22;color:${COLORS[p.type]}">
                    ${p.type.replace('_',' ')}
                </div>

                ${p.address ? `<div class="popup-address">📍 ${p.address}</div>` : ''}
                ${p.description ? `<div class="popup-desc">${p.description}</div>` : ''}
            </div>
        `)
    .addTo(map);

        // hentikan klik agar tidak diteruskan ke polygon
        e.originalEvent.stopPropagation();
    });
    map.on('mouseenter','clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave','clusters', () => { map.getCanvas().style.cursor = ''; });
  }
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats(features) {
  const count = { sekolah:0, puskesmas:0, rumah_sakit:0, tempat_ibadah:0, pasar:0, polisi:0 };
  features.forEach(f => { if (count[f.properties.type] !== undefined) count[f.properties.type]++; });
  
  if(document.getElementById('stat-sekolah')) document.getElementById('stat-sekolah').textContent = count.sekolah;
  if(document.getElementById('stat-puskesmas')) document.getElementById('stat-puskesmas').textContent = count.puskesmas;
  if(document.getElementById('stat-rs')) document.getElementById('stat-rs').textContent = count.rumah_sakit;
  if(document.getElementById('stat-ibadah')) document.getElementById('stat-ibadah').textContent = count.tempat_ibadah;
  if(document.getElementById('stat-pasar')) document.getElementById('stat-pasar').textContent = count.pasar;
  if(document.getElementById('stat-polisi')) document.getElementById('stat-polisi').textContent = count.polisi;
  if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = features.length;
  
  animateCounter('stat-sekolah', count.sekolah);
  animateCounter('stat-puskesmas', count.puskesmas);
  animateCounter('stat-rs', count.rumah_sakit);
  animateCounter('stat-ibadah', count.tempat_ibadah);
  animateCounter('stat-pasar', count.pasar);
  animateCounter('stat-polisi', count.polisi);
  animateCounter('stat-total', features.length);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min((now - startTime) / duration, 1);
    el.textContent = Math.round(start + (target - start) * p);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── FILTER ────────────────────────────────────────────────────────────────────
function filterMap() {
  activeSearch = document.getElementById('search').value;
  loadFacilities();
}

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;
    loadFacilities();
  });
});

// ── ADMIN LAYERS (highlight per-feature) ──────────────────────────────────────
const adminLoaded = { kabkota: false, kec: false, desa: false };

  async function toggleAdminLayer(key, show) {
    const cfg = ADMIN_CFG[key];
    if (show && !adminLoaded[key]) {
      const res  = await fetch(`/static/data/${cfg.file}`);
      const data = await res.json();
    
      data.features.forEach((f, i) => { f.id = i; });
      map.addSource(`src-${key}`, { type:'geojson', data, generateId: false });
    
      map.addLayer({
    id: `layer-${key}-fill`, type: 'fill', source: `src-${key}`,
    paint: { 'fill-color': cfg.color, 'fill-opacity': 0.04 }
  }, 'facilities-point'); // <--- TAMBAHKAN 'clusters' DI SINI

  // Layer fill hover
  map.addLayer({
    id: `layer-${key}-hover`, type: 'fill', source: `src-${key}`,
    paint: {
      'fill-color': cfg.color,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.28, 0]
    }
  }, 'facilities-point'); // <--- TAMBAHKAN 'clusters' DI SINI

  // Layer fill selected
  map.addLayer({
    id: `layer-${key}-selected`, type: 'fill', source: `src-${key}`,
    paint: {
      'fill-color': cfg.color,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.45, 0]
    }
  }, 'facilities-point'); // <--- TAMBAHKAN 'clusters' DI SINI

  // Layer garis
  map.addLayer({
    id: `layer-${key}-line`, type: 'line', source: `src-${key}`,
    paint: {
      'line-color': cfg.color,
      'line-width': cfg.lineW,
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.6]
    }
  }, 'facilities-point'); // <--- TAMBAHKAN 'clusters' DI SINI

    map.on('mousemove', `layer-${key}-fill`, e => {
      map.getCanvas().style.cursor = 'pointer';
      const feat = e.features[0];
      if (!feat) return;
      if (hoveredId[key] !== null && hoveredId[key] !== feat.id) {
        map.setFeatureState({ source:`src-${key}`, id: hoveredId[key] }, { hover: false });
      }
      hoveredId[key] = feat.id;
      map.setFeatureState({ source:`src-${key}`, id: feat.id }, { hover: true });
      
      const nama = feat.properties[cfg.nameField] || feat.properties.NAMOBJ || '';
      const induk = feat.properties.WADMKK ? ` · ${feat.properties.WADMKK}` : (feat.properties.WADMKC ? ` · ${feat.properties.WADMKC}` : '');
      popup.setLngLat(e.lngLat).setHTML(`
        <div class="popup-inner">
          <div class="popup-title" style="color:${cfg.color}">${nama}</div>
          <div class="popup-badge" style="background:${cfg.color}22;color:${cfg.color}">${key === 'kabkota' ? 'Kab/Kota' : key === 'kec' ? 'Kecamatan' : 'Desa/Kelurahan'}${induk}</div>
        </div>`).addTo(map);
    });
    
    map.on('mouseleave', `layer-${key}-fill`, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredId[key] !== null) {
        map.setFeatureState({ source:`src-${key}`, id: hoveredId[key] }, { hover: false });
        hoveredId[key] = null;
      }
      popup.remove();
    });

    // ── KLIK: select + filter + zoom ke polygon ──
    let selectedId = null;
    map.on('click', `layer-${key}-fill`, e => {
      const feat = e.features[0];
      if (!feat) return;
      const props = feat.properties;
      const nama  = props[cfg.nameField] || props.NAMOBJ || '';
      
      if (selectedId !== null) map.setFeatureState({ source:`src-${key}`, id: selectedId }, { selected: false });
      selectedId = feat.id;
      map.setFeatureState({ source:`src-${key}`, id: feat.id }, { selected: true });

      const filterLabel = document.getElementById('filter-area-label');
      if (key === 'desa') { activeDesa = nama; activeKec = ''; activeKabkota = ''; if(filterLabel) filterLabel.textContent = `📍 Desa ${nama}`; } 
      else if (key === 'kec') { activeKec = nama; activeDesa = ''; activeKabkota = ''; if(filterLabel) filterLabel.textContent = `📍 Kec. ${nama}`; } 
      else if (key === 'kabkota') { activeKabkota = nama; activeKec = ''; activeDesa = ''; if(filterLabel) filterLabel.textContent = `📍 ${nama}`; }
      
      const btnReset = document.getElementById('btn-reset-area');
      if(btnReset) btnReset.style.display = 'inline-block';
      loadFacilities();

      // INI KODE ZOOM YANG UDAH DIPERBAIKI (Tengah Layar)
      const geom = feat.geometry;
      const bounds = new mapboxgl.LngLatBounds();
      
      if (geom.type === 'Polygon') {
        geom.coordinates[0].forEach(coord => bounds.extend(coord));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => {
          poly[0].forEach(coord => bounds.extend(coord));
        });
      }
      // Padding di set 260px kiri-kanan biar nggak nabrak panel
      map.fitBounds(bounds, { 
        padding: { top: 80, bottom: 80, left: 260, right: 260 }, 
        duration: 1200 
      });
      
      showSidebar(nama, key, props);
    });
    adminLoaded[key] = true;
  }
  
  ['fill','hover','selected','line'].forEach(t => {
    const layerId = `layer-${key}-${t}`;
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', show ? 'visible' : 'none');
    }
  });
}

function showSidebar(nama, level, props) {
  const levelLabel = level === 'kabkota' ? 'Kabupaten/Kota' : level === 'kec' ? 'Kecamatan' : 'Desa/Kelurahan';
  const cfg = ADMIN_CFG[level];
  const content = document.getElementById('sidebar-content');
  if(!content) return;
  content.innerHTML = `
    <div class="sidebar-icon" style="background:${cfg.color}22;color:${cfg.color}">
      ${level === 'kabkota' ? '🏙️' : level === 'kec' ? '🏘️' : '🏡'}
    </div>
    <h3>${nama}</h3>
    <div class="sidebar-badge" style="background:${cfg.color}22;color:${cfg.color}">${levelLabel}</div>
    ${props.WADMKK ? `<p class="sidebar-info">📌 ${props.WADMKK}</p>` : ''}
    ${props.WADMPR ? `<p class="sidebar-info">🏛️ ${props.WADMPR}</p>` : ''}
    <div class="sidebar-divider"></div>
    <p class="sidebar-hint">Marker difilter ke wilayah ini.</p>
    <p class="sidebar-hint">Klik <b>✕ Reset</b> untuk kembali.</p>
  `;
  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = 'block';
  sidebar.classList.remove('sidebar-in');
  void sidebar.offsetWidth;
  sidebar.classList.add('sidebar-in');
}

document.getElementById('toggle-kabkota')?.addEventListener('change', e => toggleAdminLayer('kabkota', e.target.checked));
document.getElementById('toggle-kec')?.addEventListener('change',     e => toggleAdminLayer('kec',     e.target.checked));
document.getElementById('toggle-desa')?.addEventListener('change',    e => toggleAdminLayer('desa',    e.target.checked));

document.getElementById('btn-reset-area')?.addEventListener('click', () => {
  activeKec = ''; activeKabkota = ''; activeDesa = ''; 
  const filterLabel = document.getElementById('filter-area-label');
  if(filterLabel) filterLabel.textContent = '📍 Semua Wilayah';
  document.getElementById('btn-reset-area').style.display = 'none';
  const sidebar = document.getElementById('sidebar');
  if(sidebar) sidebar.style.display = 'none';
  
  ['kabkota','kec','desa'].forEach(key => { if (adminLoaded[key] && map.getSource(`src-${key}`)) map.removeFeatureState({ source:`src-${key}` }); });
  loadFacilities();
  map.flyTo({ center: CENTER, zoom: ZOOM, duration: 900 });
});

document.getElementById('sidebar-close')?.addEventListener('click', () => {
  document.getElementById('sidebar').style.display = 'none';
  ['kabkota','kec','desa'].forEach(key => { if (adminLoaded[key] && map.getSource(`src-${key}`)) map.removeFeatureState({ source:`src-${key}` }, 'selected'); });
});

// ── LAYER PANEL ───────────────────────────────────────────────────────────────
document.getElementById('btn-layers')?.addEventListener('click', () => {
  const p = document.getElementById('layer-panel');
  if (p.style.display === 'none' || p.style.display === '') {
    p.style.display = 'block'; p.classList.add('panel-open');
  } else {
    p.style.display = 'none'; p.classList.remove('panel-open');
  }
});

// ── BASEMAP ───────────────────────────────────────────────────────────────────
document.getElementById('basemap-select')?.addEventListener('change', function() {
  map.setStyle(STYLES[this.value]);
  map.once('styledata', () => {
    Object.keys(adminLoaded).forEach(k => { adminLoaded[k] = false; });
    const checks = { kabkota: document.getElementById('toggle-kabkota')?.checked, kec: document.getElementById('toggle-kec')?.checked, desa: document.getElementById('toggle-desa')?.checked };
    Object.entries(checks).forEach(([k, v]) => { if (v) toggleAdminLayer(k, true); });
    loadFacilities();
  });
});

// ── ANALISIS SPASIAL: FASILITAS TERDEKAT ──────────────────────────────────────
document.getElementById('btn-nearest')?.addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Browser tidak mendukung geolokasi.'); return; }
  const btn = document.getElementById('btn-nearest');
  btn.textContent = '📡 Mencari...'; btn.style.opacity = '0.7';
  
  navigator.geolocation.getCurrentPosition(pos => {
    const userLat = pos.coords.latitude; const userLon = pos.coords.longitude;
    if (userMarker) userMarker.remove();
    userMarker = new mapboxgl.Marker({ color:'#e74c3c', scale:1.1 })
      .setLngLat([userLon, userLat]).setPopup(new mapboxgl.Popup().setHTML('<b>📍 Lokasi Kamu</b>')).addTo(map).togglePopup();
      
    const typeFilter = activeType || null;
    fetch('/api/facilities' + (typeFilter ? `?type=${typeFilter}` : ''))
      .then(r => r.json())
      .then(data => {
        let nearest = null, minDist = Infinity;
        data.features.forEach(f => {
          const [lon, lat] = f.geometry.coordinates;
          const d = haversine(userLat, userLon, lat, lon);
          if (d < minDist) { minDist = d; nearest = f; }
        });
        
        if (!nearest) { alert('Tidak ada fasilitas ditemukan.'); btn.textContent = '📡 Terdekat'; btn.style.opacity=''; return; }
        const [nLon, nLat] = nearest.geometry.coordinates;
        const p = nearest.properties;
        const distLabel = minDist < 1 ? `${(minDist*1000).toFixed(0)} m` : `${minDist.toFixed(2)} km`;
        
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route-src')) map.removeSource('route-src');
        if (nearestMarker) nearestMarker.remove();
        
        map.addSource('route-src', { type:'geojson', data:{ type:'Feature', geometry:{ type:'LineString', coordinates:[[userLon,userLat],[nLon,nLat]] } } });
        map.addLayer({ id:'route-line', type:'line', source:'route-src', paint:{ 'line-color':'#e74c3c', 'line-width':2.5, 'line-dasharray':[2,2], 'line-opacity':0.85 } });
        routeLine = true;
        
        nearestMarker = new mapboxgl.Marker({ color: COLORS[p.type] || '#f39c12', scale:1.3 })
          .setLngLat([nLon, nLat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div class="popup-inner">
              <div class="popup-title">🏆 ${p.name}</div>
              <div class="popup-badge" style="background:${COLORS[p.type]}22; color:${COLORS[p.type]}">${p.type.replace('_',' ')}</div>
              ${p.address ? `<div class="popup-address">📍 ${p.address}</div>` : ''}
              <div class="popup-dist">📏 ${distLabel} dari lokasi kamu</div>
            </div>`)).addTo(map).togglePopup();
          
        map.fitBounds([[userLon,userLat],[nLon,nLat]], { padding:80, duration:1000 });
        btn.textContent = '📡 Terdekat'; btn.style.opacity = '';
      });
  }, () => { alert('Tidak bisa mengakses lokasi. Izinkan akses di browser.'); btn.textContent = '📡 Terdekat'; btn.style.opacity = ''; });
});

// ── MAP LOAD ──────────────────────────────────────────────────────────────────
map.on('load', () => { loadFacilities(); });