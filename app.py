from flask import Flask, render_template, request, redirect, url_for, jsonify, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# ── MODELS ──────────────────────────────────────────────────────────────────

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role     = db.Column(db.String(20), default='admin')

class Facility(db.Model):
    __tablename__ = 'facilities'
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(200), nullable=False)
    type        = db.Column(db.String(50), nullable=False)   # sekolah / puskesmas / rumah_sakit
    address     = db.Column(db.String(300))
    description = db.Column(db.Text)
    lat         = db.Column(db.Float, nullable=False)
    lon         = db.Column(db.Float, nullable=False)

# ── AUTH ─────────────────────────────────────────────────────────────────────

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and check_password_hash(user.password, request.form['password']):
            login_user(user)
            return redirect(url_for('admin_dashboard'))
        flash('Username atau password salah.')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

# ── PUBLIC ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/facilities')
def api_facilities():
    type_filter = request.args.get('type')
    search      = request.args.get('search', '')
    query = Facility.query
    if type_filter:
        query = query.filter_by(type=type_filter)
    if search:
        query = query.filter(Facility.name.ilike(f'%{search}%'))
    facilities = query.all()

    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [f.lon, f.lat]},
                "properties": {
                    "id": f.id, "name": f.name, "type": f.type,
                    "address": f.address, "description": f.description
                }
            }
            for f in facilities
        ]
    }
    return jsonify(geojson)

# ── ADMIN ─────────────────────────────────────────────────────────────────────

@app.route('/admin')
@login_required
def admin_dashboard():
    facilities = Facility.query.order_by(Facility.type, Facility.name).all()
    return render_template('admin/dashboard.html', facilities=facilities)

@app.route('/admin/add', methods=['GET', 'POST'])
@login_required
def admin_add():
    if request.method == 'POST':
        f = Facility(
            name=request.form['name'],
            type=request.form['type'],
            address=request.form['address'],
            description=request.form['description'],
            lat=float(request.form['lat']),
            lon=float(request.form['lon'])
        )
        db.session.add(f)
        db.session.commit()
        flash('Fasilitas berhasil ditambahkan.')
        return redirect(url_for('admin_dashboard'))
    return render_template('admin/add.html')

@app.route('/admin/edit/<int:id>', methods=['GET', 'POST'])
@login_required
def admin_edit(id):
    f = Facility.query.get_or_404(id)
    if request.method == 'POST':
        f.name        = request.form['name']
        f.type        = request.form['type']
        f.address     = request.form['address']
        f.description = request.form['description']
        f.lat         = float(request.form['lat'])
        f.lon         = float(request.form['lon'])
        db.session.commit()
        flash('Data berhasil diperbarui.')
        return redirect(url_for('admin_dashboard'))
    return render_template('admin/edit.html', facility=f)

@app.route('/admin/delete/<int:id>', methods=['POST'])
@login_required
def admin_delete(id):
    f = Facility.query.get_or_404(id)
    db.session.delete(f)
    db.session.commit()
    flash('Fasilitas berhasil dihapus.')
    return redirect(url_for('admin_dashboard'))

# ── INIT ──────────────────────────────────────────────────────────────────────

@app.cli.command('init-db')
def init_db():
    db.create_all()
    # Buat admin default jika belum ada
    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            password=generate_password_hash('admin123'),
            role='admin'
        )
        db.session.add(admin)
        db.session.commit()
    print('Database siap. Admin: admin / admin123')

if __name__ == '__main__':
    app.run(debug=True)
