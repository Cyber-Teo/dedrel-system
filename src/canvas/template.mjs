export async function placeTemplatePreview(templateData, item) {
  // Получаем конвертер пикселей к юнитам (grid units to pixels)
  const distancePixels = canvas.scene.grid.size / canvas.scene.grid.distance;
  const distance = templateData.distance;
  const color = templateData.fillColor || game.user.color;
  const t = templateData.t;
  
  let shape;
  let name = item ? `${item.name}` : game.i18n.localize("DEDREL.Chat.TemplateDefaultName");

  switch (t) {
    case "circle":
      shape = { type: "circle", x: 0, y: 0, radius: distance * distancePixels, gridBased: true };
      break;
    case "cone":
      shape = { type: "cone", x: 0, y: 0, radius: distance * distancePixels, angle: templateData.angle || 53.13, rotation: 0, curvature: "round", gridBased: true };
      break;
    case "ray":
      const width = templateData.width || canvas.scene.grid.distance;
      shape = { type: "line", x: 0, y: 0, length: distance * distancePixels, width: width * distancePixels, rotation: 0, gridBased: true };
      break;
    case "rect":
      // Для квадрата ширина и высота равны
      const rectSize = distance * distancePixels;
      // Для совместимости с rect, мы используем rectangle с размерами
      shape = { type: "rectangle", x: 0, y: 0, width: rectSize, height: rectSize, anchorX: 0, anchorY: 0, rotation: 0, gridBased: true };
      break;
    default:
      shape = { type: "circle", x: 0, y: 0, radius: distance * distancePixels, gridBased: true };
  }

  const regionData = {
    name: name,
    shapes: [shape],
    color: color,
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    levels: [canvas.level ? canvas.level.id : undefined].filter(Boolean),
    displayMeasurements: true
  };

  try {
    const region = await canvas.regions.placeRegion(regionData, {
      create: true,
      allowRotation: (t !== "circle")
    });
    return region;
  } catch (e) {
    console.error("Dedrel | Error placing region:", e);
    return null;
  }
}
