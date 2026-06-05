import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 13, { duration: 0.8 });
  }, [lat, lng]);
  return null;
}

export default function LocationPickerMap({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lng={lng} />
      <Marker
        position={[lat, lng]}
        draggable
        ref={markerRef}
        eventHandlers={{
          dragend: () => {
            const m = markerRef.current;
            if (m) {
              const pos = m.getLatLng();
              onChange(pos.lat, pos.lng);
            }
          },
        }}
      />
    </MapContainer>
  );
}
