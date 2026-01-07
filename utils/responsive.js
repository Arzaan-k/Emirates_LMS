import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Base dimensions for scaling (iPhone 11 Pro as reference)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

/**
 * Responsive width based on screen size
 * @param {number} size - Design width in pixels
 * @returns {number} Scaled width
 */
export const wp = (size) => {
    const scale = SCREEN_WIDTH / BASE_WIDTH;
    const newSize = size * scale;
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

/**
 * Responsive height based on screen size
 * @param {number} size - Design height in pixels
 * @returns {number} Scaled height
 */
export const hp = (size) => {
    const scale = SCREEN_HEIGHT / BASE_HEIGHT;
    const newSize = size * scale;
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

/**
 * Responsive font size
 * @param {number} size - Font size in pixels
 * @returns {number} Scaled font size
 */
export const fp = (size) => {
    const scale = SCREEN_WIDTH / BASE_WIDTH;
    const newSize = size * scale;
    // Moderate the scaling so fonts don't get too large/small
    const moderatedScale = newSize < size ? newSize : size + (newSize - size) * 0.5;
    return Math.round(PixelRatio.roundToNearestPixel(moderatedScale));
};

/**
 * Get responsive card width for grids
 * @param {number} columns - Number of columns
 * @param {number} gap - Gap between cards
 * @param {number} padding - Horizontal padding
 * @returns {number} Card width
 */
export const cardWidth = (columns = 2, gap = 12, padding = 40) => {
    return (SCREEN_WIDTH - padding - (gap * (columns - 1))) / columns;
};

export { SCREEN_WIDTH, SCREEN_HEIGHT };
