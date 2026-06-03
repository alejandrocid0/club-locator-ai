import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup } from "react-leaflet";

// Fix Leaflet's broken default icon paths when bundled with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Club = {
  id: number;
  name: string;
  type: "indoor" | "outdoor";
  courts: number;
  distance_km: number;
  lat: number;
  lng: number;
};

interface Props {
  coords: { lat: number; lng: number };
  radius: number;
  clubs: Club[];
}

const INDOOR_COLOR = "#d4522a";
const OUTDOOR_COLOR = "#4a9e6b";
const PRIMARY_COLOR = "#d4522a";

export default function CompetitionMap({ coords, radius, clubs }: Props) {
  const validClubs = clubs.filter((c) => c.lat && c.lng);

  return (
    <div className="aspect-[16/9] rounded-xl overflow-hidden border border-border">
      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Radio de análisis */}
        <Circle
          center={[coords.lat, coords.lng]}
          radius={radius * 1000}
          pathOptions={{
            color: PRIMARY_COLOR,
            fillColor: PRIMARY_COLOR,
            fillOpacity: 0.05,
            weight: 1.5,
          }}
        />

        {/* Ubicación analizada */}
        <CircleMarker
          center={[coords.lat, coords.lng]}
          radius={8}
          pathOptions={{
            color: PRIMARY_COLOR,
            fillColor: PRIMARY_COLOR,
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <Popup>
            <strong>Ubicación analizada</strong>
          </Popup>
        </CircleMarker>

        {/* Clubes cercanos */}
        {validClubs.map((c) => (
          <CircleMarker
            key={c.id}
            center={[c.lat, c.lng]}
            radius={7}
            pathOptions={{
              color: c.type === "indoor" ? INDOOR_COLOR : OUTDOOR_COLOR,
              fillColor: c.type === "indoor" ? INDOOR_COLOR : OUTDOOR_COLOR,
              fillOpacity: 0.85,
              weight: 1,
            }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{c.name}</strong>
                <br />
                {c.courts} pista{c.courts !== 1 ? "s" : ""} · {c.type}
                <br />
                <span style={{ color: "#888", fontSize: 12 }}>{c.distance_km} km del punto</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
