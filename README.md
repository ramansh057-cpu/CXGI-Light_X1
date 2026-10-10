# Miramar Battleground 3D (BGMI/PUBG Style)

A high-performance 3D First-Person tactical battle royale game built with **React**, **Three.js**, and **Vite**.

## 🎮 Features
- **700m x 700m Miramar Desert Island** with custom heightmaps, dunes, rock formations, compounds, and towns.
- **10 Strategic Places (POIs)**: Pecado, Los Leones, San Martin, El Pozo, Ruins Plateau, Hacienda, Military Camp, Minas de Carbón, Chumacera Valley, Valle del Mar.
- **40 Tactical Bot AI Enemies**:
  - Airplane skydiving and parachute drop dynamics.
  - Realistic combat engagement, jiggle strafing, and squad teamwork.
  - Full survival instincts: aggressive Blue Zone evasion.
  - Auto-reset to 100 HP upon eliminating opponents.
- **Vehicles**: Drivable UAZ & Desert Buggy with realistic suspension, terrain alignment, and wheel spin.
- **Weapons & Gunplay**: M416, AKM, AWM, Kar98k, S12K with dynamic scopes (Red Dot, 4x, 8x), recoil simulation, and hitmarkers.
- **Tactical Minimap & Radar**: Dynamic compass, safe circle indicators, gunshot sound waves, and end-game satellite intel.

## 🚀 How to Run Locally

1. **Clone this repository**:
   ```bash
   git clone https://github.com/<your-username>/miramar-battleground.git
   cd miramar-battleground
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Build for production**:
   ```bash
   npm run build
   ```

## 🌐 Deploy to GitHub Pages / Vercel / Netlify
You can deploy this project for free to:
- **Vercel**: Import your GitHub repo at [vercel.com](https://vercel.com) (Framework Preset: Vite).
- **Netlify**: Connect your GitHub repo at [netlify.com](https://netlify.com).
- **GitHub Pages**: Build with `npm run build` and deploy the `dist/` directory.
