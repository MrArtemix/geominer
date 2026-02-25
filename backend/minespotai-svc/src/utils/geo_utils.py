"""Utilitaires geospatiaux pour le service MineSpot AI."""

from shapely.geometry import box, shape
from pyproj import Transformer


def bbox_to_polygon(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> dict:
    """Convertit une bounding box en GeoJSON Polygon."""
    polygon = box(min_lon, min_lat, max_lon, max_lat)
    return {
        "type": "Polygon",
        "coordinates": [list(polygon.exterior.coords)],
    }


def calculate_area_ha(geojson: dict) -> float:
    """Calcule la superficie en hectares d'un GeoJSON polygon.

    Utilise une projection UTM pour un calcul precis.
    """
    geom = shape(geojson)
    centroid = geom.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    hemisphere = "north" if centroid.y >= 0 else "south"
    epsg = 32600 + utm_zone if hemisphere == "north" else 32700 + utm_zone

    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    coords = geom.exterior.coords
    projected_coords = [transformer.transform(x, y) for x, y in coords]

    from shapely.geometry import Polygon
    projected_polygon = Polygon(projected_coords)
    return projected_polygon.area / 10000.0


def geojson_to_wkt(geojson: dict) -> str:
    """Convertit un GeoJSON en WKT."""
    geom = shape(geojson)
    return geom.wkt


def validate_coordinates_civ(lon: float, lat: float) -> bool:
    """Verifie que les coordonnees sont dans les limites de la Cote d'Ivoire.

    Bbox approximative CI: lon [-8.6, -2.5], lat [4.3, 10.7]
    """
    return -8.6 <= lon <= -2.5 and 4.3 <= lat <= 10.7
