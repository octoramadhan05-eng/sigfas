import json
import os
from app import app, db, Facility
from dotenv import load_dotenv

load_dotenv()

# Mapping amenity OSM -> tipe di database
AMENITY_MAP = {
    'school':      'sekolah',
    'clinic':      'puskesmas',
    'health_post': 'puskesmas',
    'hospital':    'rumah_sakit',
    'place_of_worship': 'tempat_ibadah',
    'marketplace':      'pasar',         
    'police':           'polisi'       
}

def import_geojson(filepath):
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)

    added   = 0
    skipped = 0

    for feature in data.get('features', []):
        props = feature.get('properties', {})
        geom  = feature.get('geometry', {})

        # Ambil koordinat (node = Point, way = centroid via 'center')
        if geom.get('type') == 'Point':
            lon, lat = geom['coordinates']
        elif 'center' in props:
            lat = props['center']['lat']
            lon = props['center']['lon']
        else:
            skipped += 1
            continue

        amenity = props.get('amenity', '')
        tipe    = AMENITY_MAP.get(amenity)
        if not tipe:
            skipped += 1
            continue

        name = (
            props.get('name') or
            props.get('name:id') or
            props.get('name:en') or
            f"Fasilitas {tipe.replace('_',' ').title()} (tanpa nama)"
        )
        address = props.get('addr:full') or props.get('addr:street') or ''

        # Skip duplikat berdasarkan nama + koordinat
        exists = Facility.query.filter_by(name=name, lat=round(lat,6), lon=round(lon,6)).first()
        if exists:
            skipped += 1
            continue

        facility = Facility(
            name=name,
            type=tipe,
            address=address,
            description=props.get('description', ''),
            lat=round(lat, 6),
            lon=round(lon, 6)
        )
        db.session.add(facility)
        added += 1

    db.session.commit()
    print(f"✅ Import selesai: {added} data masuk, {skipped} dilewati.")

if __name__ == '__main__':
    geojson_path = os.path.join('data', 'sukoharjo_osm.geojson')
    if not os.path.exists(geojson_path):
        print(f"❌ File tidak ditemukan: {geojson_path}")
        print("   Pastikan file GeoJSON ada di folder data/")
    else:
        with app.app_context():
            import_geojson(geojson_path)
