// @ts-ignore
import isEqual from "lodash.isequal";

import * as React from 'react';

export type LayoutItem = {
  w: number,
  h: number,
  x: number,
  y: number,
  i: string,
  minW?: number,
  minH?: number,
  maxW?: number,
  maxH?: number,
  moved?: boolean,
  static?: boolean,
  isDraggable?: boolean,
  isResizable?: boolean,
  resizeHandles?: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">,
  isBounded?: boolean
};
export type Layout = Readonly<LayoutItem>[];
export type Position = {
  left: number,
  top: number,
  width: number,
  height: number
};
export type ReactDraggableCallbackData = {
  node: HTMLElement,
  x?: number,
  y?: number,
  deltaX: number,
  deltaY: number,
  lastX?: number,
  lastY?: number
};

export type PartialPosition = { left: number, top: number };
export type DroppingPosition = { left: number, top: number, e: Event };
export type Size = { width: number, height: number };
export type GridDragEvent = {
  e: Event,
  node: HTMLElement,
  newPosition: PartialPosition
};
export type GridResizeEvent = { e: Event, node: HTMLElement, size: Size };


// All callbacks are of the signature (layout, oldItem, newItem, placeholder, e).
export type EventCallback = (
        Layout: Layout,
        oldItem: LayoutItem,
        newItem: LayoutItem,
        placeholder: LayoutItem,
        Event: Event,
        HTMLElement: HTMLElement
) => void;
export type CompactType = ("horizontal" | "vertical");

const isProduction = process.env.NODE_ENV === "production";
const DEBUG = false;


// React.addons.cloneWithProps look-alike that merges style & className.
export function cloneElement(element: JSX.Element, props): JSX.Element {
  if (props.style && element.props.style) {
    props.style = {...element.props.style, ...props.style};
  }
  if (props.className && element.props.className) {
    props.className = `${element.props.className} ${props.className}`;
  }
  return React.cloneElement(element, props);
}

/**
 * Return the bottom coordinate of the layout.
 *
 * @param  {Array} layout Layout array.
 * @return {Number}       Bottom coordinate.
 */
export function bottom(layout: Layout): number {
  let max = 0,
          bottomY;
  for (let i = 0, len = layout.length; i < len; i++) {
    bottomY = layout[i].y + layout[i].h;
    if (bottomY > max) max = bottomY;
  }
  return max;
}

/**
 * Given two layoutitems, check if they collide.
 */
export function collides(l1: LayoutItem, l2: LayoutItem): boolean {
  if (l1.i === l2.i) return false; // same element
  if (l1.x + l1.w <= l2.x) return false; // l1 is left of l2
  if (l1.x >= l2.x + l2.w) return false; // l1 is right of l2
  if (l1.y + l1.h <= l2.y) return false; // l1 is above l2
  if (l1.y >= l2.y + l2.h) return false; // l1 is below l2
  return true; // boxes overlap
}

/**
 * Given a layout, compact it. This involves going down each y coordinate and removing gaps
 * between items.
 *
 * Does not modify layout items (clones). Creates a new layout array.
 *
 * @param  {Array} layout Layout.
 * @param  {Boolean} verticalCompact Whether or not to compact the layout
 *   vertically.
 * @return {Array}       Compacted Layout.
 */
export function compact(
        layout: Layout,
        compactType: CompactType,
        cols: number
): Layout {
  // Statics go in the compareWith array right away so items flow around them.
  const compareWith = getStatics(layout);
  // We go through the items by row and column.
  const sorted = sortLayoutItems(layout, compactType);
  // Holding for new items.
  const out = Array(layout.length);

  for (let i = 0, len = sorted.length; i < len; i++) {
    let l = {
      ...(sorted[i])
    };

    // Don't move static elements
    if (!l.static) {
      l = compactItem(compareWith, l, compactType, cols, sorted);

      // Add to comparison array. We only collide with items before this one.
      // Statics are already in this array.
      compareWith.push(l);
    }

    // Add to output array to make sure they still come out in the right order.
    out[layout.indexOf(sorted[i])] = l;

    // Clear moved flag, if it exists.
    l.moved = false;
  }

  return out;
}

const heightWidth = {x: "w", y: "h"};

/**
 * Before moving item down, it will check if the movement will cause collisions and move those items down before.
 */
function resolveCompactionCollision(
        layout: Layout,
        item: LayoutItem,
        moveToCoord: number,
        axis: "x" | "y"
) {
  const sizeProp = heightWidth[axis];
  item[axis] += 1;
  const itemIndex = layout
          .map(layoutItem => {
            return layoutItem.i;
          })
          .indexOf(item.i);

  // Go through each item we collide with.
  for (let i = itemIndex + 1; i < layout.length; i++) {
    const otherItem = layout[i];
    // Ignore static items
    if (otherItem.static) continue;

    // Optimization: we can break early if we know we're past this el
    // We can do this b/c it's a sorted layout
    if (otherItem.y > item.y + item.h) break;

    if (collides(item, otherItem)) {
      resolveCompactionCollision(
              layout,
              otherItem,
              // @ts-ignore
              moveToCoord + item[sizeProp],
              axis
      );
    }
  }

  item[axis] = moveToCoord;
}

/**
 * Compact an item in the layout.
 *
 * Modifies item.
 *
 */
export function compactItem(
        compareWith: Layout,
        l: LayoutItem,
        compactType: CompactType,
        cols: number,
        fullLayout: Layout
): LayoutItem {
  const compactV = compactType === "vertical";
  const compactH = compactType === "horizontal";
  if (compactV) {
    // Bottom 'y' possible is the bottom of the layout.
    // This allows you to do nice stuff like specify {y: Infinity}
    // This is here because the layout must be sorted in order to get the correct bottom `y`.
    l.y = Math.min(bottom(compareWith), l.y);
    // Move the element up as far as it can go without colliding.
    while (l.y > 0 && !getFirstCollision(compareWith, l)) {
      l.y--;
    }
  } else if (compactH) {
    // Move the element left as far as it can go without colliding.
    while (l.x > 0 && !getFirstCollision(compareWith, l)) {
      l.x--;
    }
  }

  // Move it down, and keep moving it down if it's colliding.
  let collides;
  while ((collides = getFirstCollision(compareWith, l))) {
    if (compactH) {
      resolveCompactionCollision(fullLayout, l, collides.x + collides.w, "x");
    } else {
      resolveCompactionCollision(fullLayout, l, collides.y + collides.h, "y");
    }
    // Since we can't grow without bounds horizontally, if we've overflown, let's move it down and try again.
    if (compactH && l.x + l.w > cols) {
      l.x = cols - l.w;
      l.y++;
    }
  }
  return l;
}

/**
 * Given a layout, make sure all elements fit within its bounds.
 *
 * Modifies layout items.
 *
 * @param  {Array} layout Layout array.
 * @param  {Number} bounds Number of columns.
 */
export function correctBounds(
        layout: Layout,
        bounds: { cols: number }
): Layout {
  const collidesWith = getStatics(layout);
  for (let i = 0, len = layout.length; i < len; i++) {
    const l: LayoutItem = layout[i];
    // Overflows right
    if (l.x + l.w > bounds.cols) {
      l.x = bounds.cols - l.w;
    }
    // Overflows left
    if (l.x < 0) {
      l.x = 0;
      l.w = bounds.cols;
    }
    if (!l.static) collidesWith.push(l);
    else {
      // If this is static and collides with other statics, we must move it down.
      // We have to do something nicer than just letting them overlap.
      while (getFirstCollision(collidesWith, l)) {
        l.y++;
      }
    }
  }
  return layout;
}

/**
 * Returns the first item this layout collides with.
 * It doesn't appear to matter which order we approach this from, although
 * perhaps that is the wrong thing to do.
 *
 * @param  {Object} layoutItem Layout item.
 * @return {Object|undefined}  A colliding layout item, or undefined.
 */
export function getFirstCollision(
        layout: Layout,
        layoutItem: LayoutItem
) {
  for (let i = 0, len = layout.length; i < len; i++) {
    if (collides(layout[i], layoutItem)) return layout[i];
  }
}

export function getAllCollisions(
        layout: Layout,
        layoutItem: LayoutItem
): Array<LayoutItem> {
  return layout.filter(l => collides(l, layoutItem));
}

/**
 * Get all static elements.
 * @param  {Array} layout Array of layout objects.
 * @return {Array}        Array of static layout items..
 */
export function getStatics(layout: Layout): Array<LayoutItem> {
  return layout.filter(l => l.static);
}

/**
 * Move an element. Responsible for doing cascading movements of other elements.
 *
 * Modifies layout items.
 *
 * @param  {Array}      layout            Full layout to modify.
 * @param  {LayoutItem} l                 element to move.
 * @param  {Number}     [x]               X position in grid units.
 * @param  {Number}     [y]               Y position in grid units.
 */
export function moveElement(
        layout: Layout,
        l: LayoutItem,
        x: number | undefined,
        y: number | undefined,
        isUserAction: boolean,
        preventCollision: undefined | boolean,
        compactType: CompactType,
        cols: number
): Layout {
  // If this is static and not explicitly enabled as draggable,
  // no move is possible, so we can short-circuit this immediately.
  if (l.static && l.isDraggable !== true) return layout;

  // Short-circuit if nothing to do.
  if (l.y === y && l.x === x) return layout;

  // log(
  //   `Moving element ${l.i} to [${String(x)},${String(y)}] from [${l.x},${l.y}]`
  // );
  const oldX = l.x;
  const oldY = l.y;

  // This is quite a bit faster than extending the object
  if (typeof x === "number") l.x = x;
  if (typeof y === "number") l.y = y;
  l.moved = true;

  // If this collides with anything, move it.
  // When doing this comparison, we have to sort the items we compare with
  // to ensure, in the case of multiple collisions, that we're getting the
  // nearest collision.
  let sorted = sortLayoutItems(layout, compactType);
  const movingUp =
          compactType === "vertical" && typeof y === "number"
                  ? oldY >= y
                  : compactType === "horizontal" && typeof x === "number"
                  ? oldX >= x
                  : false;
  // $FlowIgnore acceptable modification of read-only array as it was recently cloned
  if (movingUp) sorted = sorted.reverse();
  const collisions = getAllCollisions(sorted, l);

  // There was a collision; abort
  if (preventCollision && collisions.length) {
    // log(`Collision prevented on ${l.i}, reverting.`);
    l.x = oldX;
    l.y = oldY;
    l.moved = false;
    return layout;
  }

  // Move each item that collides away from this element.
  for (let i = 0, len = collisions.length; i < len; i++) {
    const collision = collisions[i];
    // log(
    //   `Resolving collision between ${l.i} at [${l.x},${l.y}] and ${collision.i} at [${collision.x},${collision.y}]`
    // );

    // Short circuit so we can't infinite loop
    if (collision.moved) continue;

    // Don't move static items - we have to move *this* element away
    if (collision.static) {
      layout = moveElementAwayFromCollision(
              layout,
              collision,
              l,
              isUserAction,
              compactType,
              cols
      );
    } else {
      layout = moveElementAwayFromCollision(
              layout,
              l,
              collision,
              isUserAction,
              compactType,
              cols
      );
    }
  }

  return layout;
}

/**
 * This is where the magic needs to happen - given a collision, move an element away from the collision.
 * We attempt to move it up if there's room, otherwise it goes below.
 *
 * @param  {Array} layout            Full layout to modify.
 * @param  {LayoutItem} collidesWith Layout item we're colliding with.
 * @param  {LayoutItem} itemToMove   Layout item we're moving.
 */
export function moveElementAwayFromCollision(
        layout: Layout,
        collidesWith: LayoutItem,
        itemToMove: LayoutItem,
        isUserAction: boolean,
        compactType: CompactType,
        cols: number
): Layout {
  const compactH: boolean | number | undefined = compactType === "horizontal";
  // Compact vertically if not set to horizontal
  const compactV: boolean | number | undefined = compactType !== "horizontal";
  const preventCollision = collidesWith.static; // we're already colliding (not for static items)

  // If there is enough space above the collision to put this element, move it there.
  // We only do this on the main collision as this can get funky in cascades and cause
  // unwanted swapping behavior.
  if (isUserAction) {
    // Reset isUserAction flag because we're not in the main collision anymore.
    isUserAction = false;

    // Make a mock item so we don't modify the item here, only modify in moveElement.
    const fakeItem: LayoutItem = {
      x: compactH ? Math.max(collidesWith.x - itemToMove.w, 0) : itemToMove.x,
      y: compactV ? Math.max(collidesWith.y - itemToMove.h, 0) : itemToMove.y,
      w: itemToMove.w,
      h: itemToMove.h,
      i: "-1"
    };

    // No collision? If so, we can go up there; otherwise, we'll end up moving down as normal
    if (!getFirstCollision(layout, fakeItem)) {
      // log(
      //   `Doing reverse collision on ${itemToMove.i} up to [${fakeItem.x},${fakeItem.y}].`
      // );
      return moveElement(
              layout,
              itemToMove,
              compactH ? fakeItem.x : undefined,
              compactV ? fakeItem.y : undefined,
              isUserAction,
              preventCollision,
              compactType,
              cols
      );
    }
  }

  return moveElement(
          layout,
          itemToMove,
          compactH ? itemToMove.x + 1 : undefined,
          compactV ? itemToMove.y + 1 : undefined,
          isUserAction,
          preventCollision,
          compactType,
          cols
  );
}

/**
 * Get layout items sorted from top left to right and down.
 *
 * @return {Array} Array of layout objects.
 * @return {Array}        Layout, sorted static items first.
 */
export function sortLayoutItems(
        layout: Layout,
        compactType: CompactType
): Layout {
  if (compactType === "horizontal") return sortLayoutItemsByColRow(layout);
  else return sortLayoutItemsByRowCol(layout);
}

/**
 * Sort layout items by row ascending and column ascending.
 *
 * Does not modify Layout.
 */
export function sortLayoutItemsByRowCol(layout: Layout): Layout {
  // Slice to clone array as sort modifies
  return layout.slice(0).sort(function(a, b) {
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) {
      return 1;
    } else if (a.y === b.y && a.x === b.x) {
      // Without this, we can get different sort results in IE vs. Chrome/FF
      return 0;
    }
    return -1;
  });
}

/**
 * Sort layout items by column ascending then row ascending.
 *
 * Does not modify Layout.
 */
export function sortLayoutItemsByColRow(layout: Layout): Layout {
  return layout.slice(0).sort(function(a, b) {
    if (a.x > b.x || (a.x === b.x && a.y > b.y)) {
      return 1;
    }
    return -1;
  });
}

/**
 * Generate a layout using the initialLayout and children as a template.
 * Missing entries will be added, extraneous ones will be truncated.
 *
 * Does not modify initialLayout.
 *
 * @param  {Array}  initialLayout Layout passed in through props.
 * @param  {String} breakpoint    Current responsive breakpoint.
 * @param  {?String} compact      Compaction option.
 * @return {Array}                Working layout.
 */
export function synchronizeLayoutWithChildren(
        initialLayout: Layout,
        children: any,
        cols: number,
        compactType: CompactType
): Layout {
  initialLayout = initialLayout || [];

  // Generate one layout item per child.
  const layout: LayoutItem[] = [];
  if(children) {
  React.Children.forEach(children, (child, i: number) => {
    // Don't overwrite if it already exists.
    const exists = initialLayout.find(((value, index) => initialLayout[index]?.i === String(child.key)));
    if (exists) {
      layout[i] = {
        ...(exists)
      };
    } else {
      if (!isProduction && child.props._grid) {
        console.warn(
                "`_grid` properties on children have been deprecated as of React 15.2. " + // eslint-disable-line
                "Please use `data-grid` or add your properties directly to the `layout`."
        );
      }
      const g = child?.props["data-grid"] || child.props?._grid;

      // Hey, this item has a data-grid property, use it.
      if (g) {
        if (!isProduction) {
          validateLayout([g], "ReactGridLayout.children");
        }
        // FIXME clone not really necessary here
        layout[i] = {
          ...({...g, i: child.key})
        };
      } else {
        // Nothing provided: ensure this is added to the bottom
        // FIXME clone not really necessary here
        layout[i] = {
          ...({
            w: 1,
            h: 1,
            x: 0,
            y: bottom(layout),
            i: String(child.key)
          })
        };
      }
    }
  });
  }

  // Correct the layout.
  const correctedLayout = correctBounds(layout, {cols: cols});
  return compact(correctedLayout, compactType, cols);
}

/**
 * Validate a layout. Throws errors.
 *
 * @param  {Array}  layout        Array of layout items.
 * @param  {String} [contextName] Context name for errors.
 * @throw  {Error}                Validation error.
 */
export function validateLayout(
        layout: Layout,
        contextName: string = "Layout"
): void {
  const subProps = ["x", "y", "w", "h"];
  if (!Array.isArray(layout))
    throw new Error(contextName + " must be an array!");
  for (let i = 0, len = layout.length; i < len; i++) {
    const item = layout[i];
    for (let j = 0; j < subProps.length; j++) {
      // @ts-ignore
      if (typeof item[subProps[j]] !== "number") {
        throw new Error(
                "ReactGridLayout: " +
                contextName +
                "[" +
                i +
                "]." +
                subProps[j] +
                " must be a number!"
        );
      }
    }
    if (item.i && typeof item.i !== "string") {
      throw new Error(
              "ReactGridLayout: " + contextName + "[" + i + "].i must be a string!"
      );
    }
    if (item.static !== undefined && typeof item.static !== "boolean") {
      throw new Error(
              "ReactGridLayout: " +
              contextName +
              "[" +
              i +
              "].static must be a boolean!"
      );
    }
  }
}

