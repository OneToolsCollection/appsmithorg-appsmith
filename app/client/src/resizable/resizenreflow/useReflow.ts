import { reflowMove, startReflow, stopReflow } from "actions/reflowActions";
import { DropTargetContext } from "components/editorComponents/DropTargetComponent";
import { GridDefaults } from "constants/WidgetConstants";
import { UIElementSize } from "components/editorComponents/ResizableUtils";
import { OccupiedSpace } from "constants/editorConstants";
import { ceil, cloneDeep } from "lodash";
import { RefObject, useRef, useContext, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Reflow,
  reflowWidgets,
  StaticReflowWidget,
} from "reducers/uiReducers/reflowReducer";
import { DimensionProps, ResizeDirection } from "resizable/resizenreflow";
import { getOccupiedSpaces } from "selectors/editorSelectors";
import { generateClassName, getNearestParentCanvas } from "utils/generators";
import { scrollElementIntoParentCanvasView } from "utils/helpers";
import { XYCord } from "utils/hooks/useCanvasDragging";
import { getSnapColumns, Rect } from "utils/WidgetPropsUtils";
import { WidgetRowCols } from "widgets/BaseWidget";
import { getReflowWidgetSelector } from "selectors/widgetReflowSelectors";

type WidgetCollisionGraph = OccupiedSpace & {
  children?: {
    [key: string]: WidgetCollisionGraph;
  };
};

const MIN_RESIZE_LIMIT = 2;

const computeRowCols = (
  delta: UIElementSize,
  position: XYCord,
  widgetPosition: OccupiedSpace,
  widgetParentSpaces: WidgetParentSpaces,
) => {
  return {
    leftColumn: Math.round(
      widgetPosition.left + position.x / widgetParentSpaces.parentColumnSpace,
    ),
    topRow: Math.round(
      widgetPosition.top + position.y / widgetParentSpaces.parentRowSpace,
    ),
    rightColumn: Math.round(
      widgetPosition.right +
        (delta.width + position.x) / widgetParentSpaces.parentColumnSpace,
    ),
    bottomRow: Math.round(
      widgetPosition.bottom +
        (delta.height + position.y) / widgetParentSpaces.parentRowSpace,
    ),
  };
};

export type WidgetParentSpaces = {
  parentColumnSpace: number;
  parentRowSpace: number;
  paddingOffset: number;
};

enum widgetDimensions {
  top = "top",
  bottom = "bottom",
  left = "left",
  right = "right",
}

enum MathComparators {
  min = "min",
  max = "max",
}

type CollisionAccessors = {
  direction: widgetDimensions;
  oppositeDirection: widgetDimensions;
  perpendicularMax: widgetDimensions;
  perpendicularMin: widgetDimensions;
  parallelMax: widgetDimensions;
  parallelMin: widgetDimensions;
  mathComparator: MathComparators;
  directionIndicator: number;
  isHorizontal: boolean;
};

export const useReflow = (
  widgetId: string,
  parentId: string,
  widgetPosition: OccupiedSpace,
  resizableRef: RefObject<HTMLDivElement>,
  ignoreCollision: boolean,
  widgetParentSpaces: WidgetParentSpaces,
) => {
  const occupiedSpaces = useSelector(getOccupiedSpaces);
  const widgetReflowSelector = getReflowWidgetSelector(widgetId);
  const reflowState = useSelector(widgetReflowSelector);
  const positions = useRef({ X: 0, Y: 0 });
  const occupiedSpacesBySiblingWidgets = useMemo(() => {
    return occupiedSpaces && parentId && occupiedSpaces[parentId]
      ? occupiedSpaces[parentId]
      : undefined;
  }, [occupiedSpaces, parentId]);

  const { updateDropTargetRows } = useContext(DropTargetContext);

  const dispatch = useDispatch();

  // Resize bound's className - defaults to body
  // ResizableContainer accepts the className of the element,
  // whose clientRect will act as the bounds for resizing.
  // Note, if there are many containers with the same className
  // the bounding container becomes the nearest parent with the className
  const boundingElementClassName = generateClassName(parentId);
  const possibleBoundingElements = document.getElementsByClassName(
    boundingElementClassName,
  );
  const boundingElement =
    possibleBoundingElements.length > 0
      ? possibleBoundingElements[0]
      : undefined;

  // Calculate the dimensions of the widget,
  // The ResizableContainer's size prop is controlled
  const dimensions: UIElementSize = {
    width:
      (widgetPosition.right - widgetPosition.left) *
        widgetParentSpaces.parentColumnSpace -
      2 * widgetParentSpaces.paddingOffset,
    height:
      (widgetPosition.bottom - widgetPosition.top) *
        widgetParentSpaces.parentRowSpace -
      2 * widgetParentSpaces.paddingOffset,
  };

  const isColliding = (newDimensions: UIElementSize, position: XYCord) => {
    // Moving the bounding element calculations inside
    // to make this expensive operation only whne
    const boundingElementClientRect = boundingElement
      ? boundingElement.getBoundingClientRect()
      : undefined;

    const bottom =
      widgetPosition.top +
      position.y / widgetParentSpaces.parentRowSpace +
      newDimensions.height / widgetParentSpaces.parentRowSpace;
    // Make sure to calculate collision IF we don't update the main container's rows
    let updated = false;
    if (updateDropTargetRows) {
      updated = !!updateDropTargetRows(widgetId, bottom);
      const el = resizableRef.current;
      if (el) {
        const { height } = el?.getBoundingClientRect();
        const scrollParent = getNearestParentCanvas(resizableRef.current);
        scrollElementIntoParentCanvasView(
          {
            top: 40,
            height,
          },
          scrollParent,
          el,
        );
      }
    }

    const delta: UIElementSize = {
      height: newDimensions.height - dimensions.height,
      width: newDimensions.width - dimensions.width,
    };
    const newRowCols: WidgetRowCols | false = computeRowCols(
      delta,
      position,
      widgetPosition,
      widgetParentSpaces,
    );

    if (newRowCols.rightColumn > getSnapColumns()) {
      return { isColliding: true };
    }

    // Minimum row and columns to be set to a widget.
    if (
      newRowCols.rightColumn - newRowCols.leftColumn < 2 ||
      newRowCols.bottomRow - newRowCols.topRow < 4
    ) {
      return { isColliding: true };
    }

    if (
      boundingElementClientRect &&
      newRowCols.rightColumn * widgetParentSpaces.parentColumnSpace >
        ceil(boundingElementClientRect.width)
    ) {
      return { isColliding: true };
    }

    if (newRowCols && newRowCols.leftColumn < 0) {
      return { isColliding: true };
    }

    if (!updated) {
      if (
        boundingElementClientRect &&
        newRowCols.bottomRow * widgetParentSpaces.parentRowSpace >
          ceil(boundingElementClientRect.height)
      ) {
        return { isColliding: true };
      }

      if (newRowCols && newRowCols.topRow < 0) {
        return { isColliding: true };
      }
    }

    // this is required for list widget so that template have no collision
    if (ignoreCollision) return { isColliding: false };

    const resizedPositions = {
      left: newRowCols.leftColumn,
      top: newRowCols.topRow,
      bottom: newRowCols.bottomRow,
      right: newRowCols.rightColumn,
    };

    const { collidingWidgets, isColliding } = getCollidingWidgets(
      resizedPositions,
      widgetId,
      occupiedSpacesBySiblingWidgets,
    );
    // Check if new row cols are occupied by sibling widgets
    return {
      resizedPositions,
      isColliding,
      collidingWidgets,
    };
  };

  const reflow = (
    dimensions: DimensionProps,
  ): { verticalMove: boolean; horizontalMove: boolean } => {
    const { direction, height, width, x, X = 0, y, Y = 0 } = dimensions;

    const {
      collidingWidgets,
      isColliding: isWidgetsColliding,
      resizedPositions,
    } = isColliding({ width, height }, { x, y });

    const newWidgetPosition = {
      ...widgetPosition,
      ...resizedPositions,
    };

    if (!isWidgetsColliding && reflowState?.isReflowing) {
      dispatch(stopReflow());
      positions.current = { X, Y };
      return {
        horizontalMove: true,
        verticalMove: true,
      };
    }

    if (
      direction === ResizeDirection.UNSET ||
      !isWidgetsColliding ||
      !occupiedSpacesBySiblingWidgets
    ) {
      positions.current = { X, Y };
      return {
        horizontalMove: true,
        verticalMove: true,
      };
    }

    let newStaticWidget = reflowState?.reflow?.staticWidget;
    if (!reflowState?.isReflowing) {
      let widgetReflow: Reflow = {
        staticWidgetId: newWidgetPosition.id,
        resizeDirections: direction,
      };
      if (direction.indexOf("|") > -1) {
        const isHorizontalMove = getIsHorizontalMove(positions.current, {
          X,
          Y,
        });

        if (isHorizontalMove === undefined)
          return {
            horizontalMove: true,
            verticalMove: true,
          };

        const directions = direction.split("|");
        const currentDirection = isHorizontalMove
          ? directions[1]
          : directions[0];
        if (currentDirection === "RIGHT") {
          currentDirection;
        }
        //eslint-disable-next-line
        console.log(currentDirection, positions.current, { X, Y });
        const widgetMovementMap: reflowWidgets = {};
        newStaticWidget = getMovementMapInDirection(
          widgetMovementMap,
          occupiedSpacesBySiblingWidgets,
          collidingWidgets,
          newWidgetPosition,
          currentDirection as ResizeDirection,
          widgetParentSpaces,
          { X, Y },
        );
        widgetReflow = {
          ...widgetReflow,
          reflowingWidgets: widgetMovementMap,
          staticWidget: newStaticWidget,
        };
      } else {
        const widgetMovementMap: reflowWidgets = {};
        newStaticWidget = getMovementMapInDirection(
          widgetMovementMap,
          occupiedSpacesBySiblingWidgets,
          collidingWidgets,
          newWidgetPosition,
          direction,
          widgetParentSpaces,
          { X, Y },
        );
        widgetReflow = {
          ...widgetReflow,
          reflowingWidgets: widgetMovementMap,
          staticWidget: newStaticWidget,
        };
      }
      dispatch(startReflow(widgetReflow));
    } else if (reflowState.reflow && reflowState.reflow.reflowingWidgets) {
      const reflowing = { ...reflowState.reflow };
      let horizontalMove = true,
        verticalMove = true;
      if (direction.indexOf("|") > -1) {
        const isHorizontalMove = getIsHorizontalMove(positions.current, {
          X,
          Y,
        });

        if (isHorizontalMove === undefined)
          return {
            horizontalMove: true,
            verticalMove: true,
          };

        const { reflowingWidgets, staticWidget } = reflowState.reflow;
        newStaticWidget = getCompositeMovementMap(
          occupiedSpacesBySiblingWidgets,
          collidingWidgets,
          { ...newWidgetPosition, ...resizedPositions },
          direction,
          widgetParentSpaces,
          { X, Y },
          reflowingWidgets,
          staticWidget,
          isHorizontalMove,
        );

        ({ horizontalMove, verticalMove } = getShouldResize(newStaticWidget, {
          X,
          Y,
        }));
        const affectedwidgetIds = Object.keys(reflowingWidgets);
        for (const affectedwidgetId of affectedwidgetIds) {
          if (reflowingWidgets && reflowingWidgets[affectedwidgetId]) {
            if (horizontalMove) reflowingWidgets[affectedwidgetId].x = X;
            if (verticalMove) reflowingWidgets[affectedwidgetId].y = Y;
          }
        }
        reflowing.reflowingWidgets = { ...reflowingWidgets };
        reflowing.staticWidget = newStaticWidget;
      } else {
        //eslint-disable-next-line
        const affectedwidgetIds = Object.keys(reflowing.reflowingWidgets!);
        ({ horizontalMove, verticalMove } = getShouldResize(newStaticWidget, {
          X,
          Y,
        }));
        for (const affectedwidgetId of affectedwidgetIds) {
          if (
            reflowing.reflowingWidgets &&
            reflowing.reflowingWidgets[affectedwidgetId]
          ) {
            if (horizontalMove)
              reflowing.reflowingWidgets[affectedwidgetId].x = X;
            if (verticalMove)
              reflowing.reflowingWidgets[affectedwidgetId].y = Y;
          }
        }
      }
      dispatch(reflowMove(reflowing));
      positions.current = { X, Y };
      return {
        horizontalMove,
        verticalMove,
      };
    }
    positions.current = { X, Y };

    return {
      horizontalMove: true,
      verticalMove: true,
    };
  };

  return reflow;
};

function getShouldResize(
  staticWidget: StaticReflowWidget | undefined,
  dimensions = { X: 0, Y: 0 },
): { verticalMove: boolean; horizontalMove: boolean } {
  if (!staticWidget)
    return {
      horizontalMove: false,
      verticalMove: false,
    };

  let horizontalMove = true,
    verticalMove = true;
  const {
    directionXIndicator,
    directionYIndicator,
    mathXComparator,
    mathYComparator,
    maxX,
    maxY,
  } = staticWidget;
  if (mathXComparator) {
    horizontalMove =
      Math[mathXComparator as MathComparators](
        dimensions.X,
        //eslint-disable-next-line
        directionXIndicator! * maxX!,
      ) !==
      //eslint-disable-next-line
      directionXIndicator! * maxX!;
  }
  if (mathYComparator) {
    verticalMove =
      Math[mathYComparator as MathComparators](
        dimensions.Y,
        //eslint-disable-next-line
        directionYIndicator! * maxY!,
      ) !==
      //eslint-disable-next-line
      directionYIndicator! * maxY!;
  }

  return {
    horizontalMove,
    verticalMove,
  };
}

function getWidgetCollisionGraphInDirection(
  occupiedSpacesBySiblingWidgets: OccupiedSpace[],
  widgetPosition: WidgetCollisionGraph,
  collidingWidgets: OccupiedSpace[],
  accessors: CollisionAccessors,
) {
  const widgetCollisionGraph: WidgetCollisionGraph = {
    ...widgetPosition,
    children: {},
  };
  const collidingWidgetsInDirection = collidingWidgets.filter(
    (widgetDetails) => {
      if (
        widgetDetails[accessors.perpendicularMax] <=
        widgetCollisionGraph[accessors.perpendicularMin]
      )
        return false;
      if (
        widgetDetails[accessors.perpendicularMin] >=
        widgetCollisionGraph[accessors.perpendicularMax]
      )
        return false;

      return true;
    },
  );
  if (collidingWidgetsInDirection.length <= 0) return;
  for (const collidingWidget of collidingWidgetsInDirection) {
    const collidingWidgetGraph = { ...collidingWidget, children: {} };
    getWidgetCollisionGraph(
      occupiedSpacesBySiblingWidgets,
      collidingWidgetGraph,
      {},
      accessors,
    );
    if (widgetCollisionGraph.children)
      widgetCollisionGraph.children[
        collidingWidgetGraph.id
      ] = collidingWidgetGraph;
    else
      widgetCollisionGraph.children = {
        [collidingWidgetGraph.id]: collidingWidgetGraph,
      };
  }

  return widgetCollisionGraph;
}
function getWidgetCollisionGraph(
  occupiedSpacesBySiblingWidgets: OccupiedSpace[],
  widgetCollisionGraph: WidgetCollisionGraph,
  processedNodes: { [key: string]: WidgetCollisionGraph } = {},
  accessors: CollisionAccessors,
) {
  if (!widgetCollisionGraph) return;

  const possiblyAffectedWidgets = occupiedSpacesBySiblingWidgets.filter(
    (widgetDetails) => {
      const directionalComparator =
        accessors.directionIndicator < 0
          ? widgetDetails[accessors.oppositeDirection] <
            widgetCollisionGraph[accessors.oppositeDirection]
          : widgetDetails[accessors.oppositeDirection] >
            widgetCollisionGraph[accessors.oppositeDirection];
      return (
        widgetDetails.id !== widgetCollisionGraph.id && directionalComparator
      );
    },
  );

  const affectedWidgets = possiblyAffectedWidgets.filter((widgetDetails) => {
    if (
      widgetDetails[accessors.perpendicularMax] <=
      widgetCollisionGraph[accessors.perpendicularMin]
    )
      return false;
    if (
      widgetDetails[accessors.perpendicularMin] >=
      widgetCollisionGraph[accessors.perpendicularMax]
    )
      return false;

    return true;
  });

  affectedWidgets.sort((widgetA, widgetB) => {
    return (
      accessors.directionIndicator * -1 * widgetB[accessors.oppositeDirection] +
      accessors.directionIndicator * widgetA[accessors.oppositeDirection]
    );
  });
  const initialCollidingWidget = { ...affectedWidgets[0] };

  while (affectedWidgets.length > 0) {
    const currentWidgetCollisionGraph = {
      ...affectedWidgets.shift(),
    } as WidgetCollisionGraph;

    if (!currentWidgetCollisionGraph) break;

    if (!processedNodes[currentWidgetCollisionGraph.id]) {
      getWidgetCollisionGraph(
        possiblyAffectedWidgets,
        currentWidgetCollisionGraph,
        processedNodes,
        accessors,
      );
      processedNodes[currentWidgetCollisionGraph.id] = {
        ...currentWidgetCollisionGraph,
      };
    }

    if (widgetCollisionGraph.children)
      widgetCollisionGraph.children[currentWidgetCollisionGraph.id] = {
        ...currentWidgetCollisionGraph,
      };
    else
      widgetCollisionGraph.children = {
        [currentWidgetCollisionGraph.id]: { ...currentWidgetCollisionGraph },
      };
  }

  return initialCollidingWidget;
}

function getWidgetMovementMap(
  widgetPosition: WidgetCollisionGraph,
  widgetMovementMap: reflowWidgets,
  dimensions = { X: 0, Y: 0 },
  widgetParentSpaces: WidgetParentSpaces,
  accessors: CollisionAccessors,
  direction: ResizeDirection,
  whiteSpace = 0,
  prevWidgetdistance: number,
) {
  // if (widgetMovementMap[widgetPosition.id]) {
  //   return {
  //     occupiedSpace:
  //       (widgetMovementMap[widgetPosition.id].maxOccupiedSpace || 0) +
  //       widgetPosition[accessors.parallelMax] -
  //       widgetPosition[accessors.parallelMin],
  //     depth: (widgetMovementMap[widgetPosition.id].depth || 0) + 1,
  //   };
  // }

  let maxOccupiedSpace = 0,
    depth = 0;
  const childrenCount = Object.keys(widgetPosition.children || {}).length;
  let currentWhiteSpace = whiteSpace;
  if (widgetPosition.children && childrenCount > 0) {
    const childNodes = Object.values(widgetPosition.children);
    for (const childNode of childNodes) {
      const {
        currentWhiteSpace: childWhiteSpace,
        depth: widgetDepth,
        occupiedSpace,
      } = getWidgetMovementMap(
        childNode,
        widgetMovementMap,
        dimensions,
        widgetParentSpaces,
        accessors,
        direction,
        Math.abs(prevWidgetdistance - childNode[accessors.oppositeDirection]),
        childNode[accessors.direction],
      );
      if (maxOccupiedSpace < occupiedSpace) currentWhiteSpace = childWhiteSpace;
      maxOccupiedSpace = Math.max(maxOccupiedSpace, occupiedSpace || 0);
      depth = widgetDepth;
    }
  } else {
    if (direction === ResizeDirection.RIGHT)
      currentWhiteSpace +=
        GridDefaults.DEFAULT_GRID_COLUMNS - widgetPosition.right;
    else if (direction === ResizeDirection.BOTTOM) currentWhiteSpace = Infinity;
    else currentWhiteSpace += widgetPosition[accessors.direction];
  }

  if (accessors.isHorizontal) {
    const maxX =
      direction === ResizeDirection.RIGHT
        ? (GridDefaults.DEFAULT_GRID_COLUMNS -
            widgetPosition[accessors.direction] -
            depth * MIN_RESIZE_LIMIT) *
          widgetParentSpaces.parentColumnSpace
        : (widgetPosition[accessors.direction] - depth * MIN_RESIZE_LIMIT) *
          widgetParentSpaces.parentColumnSpace;
    widgetMovementMap[widgetPosition.id] = {
      x: dimensions.X,
      maxX: accessors.directionIndicator * maxX,
      maxOccupiedSpace,
      depth,
      dimensionXBeforeCollision:
        dimensions.X -
        accessors.directionIndicator * widgetParentSpaces.parentColumnSpace,
      whiteSpaces: currentWhiteSpace,
      get X() {
        const originalWidth =
          (widgetPosition[accessors.parallelMax] -
            widgetPosition[accessors.parallelMin]) *
          widgetParentSpaces.parentColumnSpace;
        const value =
          this.x !== undefined
            ? this.x - (this.dimensionXBeforeCollision || 0)
            : 0;
        return (
          Math[accessors.mathComparator](value, this.maxX || 0) +
          accessors.directionIndicator * (originalWidth - (this.width || 0))
        );
      },
      get width() {
        const originalWidth =
          widgetPosition[accessors.parallelMax] -
          widgetPosition[accessors.parallelMin];
        const max =
          (this.dimensionXBeforeCollision || 0) +
          ((this.whiteSpaces || 0) +
            maxOccupiedSpace -
            (depth + 1) * MIN_RESIZE_LIMIT) *
            widgetParentSpaces.parentColumnSpace;
        const resizeLimit =
          max +
          (originalWidth - MIN_RESIZE_LIMIT) *
            widgetParentSpaces.parentColumnSpace;
        let X = 0;
        const shouldResize =
          accessors.directionIndicator > 0
            ? (this.x || 0) > max
            : (this.x || 0) < max;
        if (shouldResize) {
          X = Math[accessors.mathComparator](
            this.x || 0,
            accessors.directionIndicator * resizeLimit,
          );
          X = X - max;
        }

        return (
          originalWidth * widgetParentSpaces.parentColumnSpace - Math.abs(X)
        );
      },
    };
  } else {
    const maxY =
      direction === ResizeDirection.BOTTOM
        ? -Infinity
        : (widgetPosition[accessors.direction] - maxOccupiedSpace) *
          widgetParentSpaces.parentRowSpace;
    widgetMovementMap[widgetPosition.id] = {
      y: dimensions.Y,
      maxY,
      maxOccupiedSpace,
      depth,
      dimensionYBeforeCollision:
        dimensions.Y -
        accessors.directionIndicator * widgetParentSpaces.parentRowSpace,
      get Y() {
        const value =
          this.y !== undefined
            ? this.y - (this.dimensionYBeforeCollision || 0)
            : 0;
        return Math[accessors.mathComparator](
          value,
          accessors.directionIndicator * (this.maxY || 0),
        );
      },
    };
  }

  return {
    occupiedSpace:
      maxOccupiedSpace +
      widgetPosition[accessors.parallelMax] -
      widgetPosition[accessors.parallelMin],
    depth: depth + 1,
    currentWhiteSpace,
  };
}

function getCompositeMovementMap(
  occupiedSpacesBySiblingWidgets: OccupiedSpace[],
  collidingWidgets: OccupiedSpace[] = [],
  widgetPosition: WidgetCollisionGraph,
  direction: ResizeDirection,
  widgetParentSpaces: WidgetParentSpaces,
  dimensions = { X: 0, Y: 0 },
  reflowWidgets: reflowWidgets,
  staticWidget: StaticReflowWidget | undefined,
  isHorizontalMove: boolean,
) {
  const directions = direction.split("|");
  const { horizontalKeys, verticalKeys } = getDirectionalKeysFromWidgets(
    reflowWidgets,
  );
  const horizontalOccupiedSpaces = occupiedSpacesBySiblingWidgets.filter(
    (widgetDetail) => verticalKeys.indexOf(widgetDetail.id) < 0,
  );
  const verticalOccupiedSpaces = occupiedSpacesBySiblingWidgets.filter(
    (widgetDetail) => horizontalKeys.indexOf(widgetDetail.id) < 0,
  );

  const horizontalCollidingWidgets = collidingWidgets.filter(
    (widgetDetail) => verticalKeys.indexOf(widgetDetail.id) < 0,
  );
  const verticalCollidingWidgets = collidingWidgets.filter(
    (widgetDetail) => horizontalKeys.indexOf(widgetDetail.id) < 0,
  );

  let primaryDirection, secondaryDirection;
  let primaryOccupiedSpaces, secondaryOccupiedSpaces;
  let primaryCollidingWidgets, secondaryCollidingWidgets;
  if (isHorizontalMove) {
    primaryDirection = directions[1];
    secondaryDirection = directions[0];
    primaryOccupiedSpaces = horizontalOccupiedSpaces;
    secondaryOccupiedSpaces = verticalOccupiedSpaces;
    primaryCollidingWidgets = horizontalCollidingWidgets;
    secondaryCollidingWidgets = verticalCollidingWidgets;
  } else {
    primaryDirection = directions[0];
    secondaryDirection = directions[1];
    primaryOccupiedSpaces = verticalOccupiedSpaces;
    secondaryOccupiedSpaces = horizontalOccupiedSpaces;
    primaryCollidingWidgets = verticalCollidingWidgets;
    secondaryCollidingWidgets = horizontalCollidingWidgets;
  }
  const primaryWidgetMovementMap: reflowWidgets = {};
  const primaryStaticWidget = getMovementMapInDirection(
    primaryWidgetMovementMap,
    primaryOccupiedSpaces,
    primaryCollidingWidgets,
    widgetPosition,
    primaryDirection as ResizeDirection,
    widgetParentSpaces,
    dimensions,
  );

  const primaryCollidingKeys = Object.keys(primaryWidgetMovementMap || {});
  const reflowWidgetKeys = Object.keys(reflowWidgets);

  secondaryOccupiedSpaces = secondaryOccupiedSpaces.filter(
    (widgetDetail) => primaryCollidingKeys.indexOf(widgetDetail.id) < 0,
  );
  secondaryCollidingWidgets = secondaryCollidingWidgets.filter(
    (widgetDetail) => primaryCollidingKeys.indexOf(widgetDetail.id) < 0,
  );
  delete widgetPosition.children;

  const secondaryWidgetMovementMap: reflowWidgets = {};
  const secondaryStaticWidget = getMovementMapInDirection(
    secondaryWidgetMovementMap,
    secondaryOccupiedSpaces,
    secondaryCollidingWidgets,
    widgetPosition,
    secondaryDirection as ResizeDirection,
    widgetParentSpaces,
    dimensions,
  );

  const secondaryCollidingKeys = Object.keys(secondaryWidgetMovementMap || {});

  const allReflowKeys: string[] = primaryCollidingKeys.concat(
    secondaryCollidingKeys,
  );

  const keysToDelete = reflowWidgetKeys.filter(
    (key) => allReflowKeys.indexOf(key) < 0,
  );

  for (const keyToDelete of keysToDelete) {
    delete reflowWidgets[keyToDelete];
  }

  if (primaryCollidingKeys.length > 0 || secondaryCollidingKeys.length > 0) {
    for (const key of allReflowKeys) {
      if (!reflowWidgets[key]) {
        const reflowWidget =
          primaryWidgetMovementMap[key] || secondaryWidgetMovementMap[key];
        reflowWidgets[key] = reflowWidget;
      }
    }
  }
  //eslint-disable-next-line
  console.log(cloneDeep({ widgets: reflowWidgets, direction }));
  if (primaryCollidingKeys.length > 0 && secondaryCollidingKeys.length <= 0) {
    return primaryStaticWidget;
  } else if (primaryCollidingKeys.length > 0) {
    return {
      ...staticWidget,
      ...primaryStaticWidget,
    };
  }

  return {
    ...staticWidget,
  };
}
function getMovementMapInDirection(
  widgetMovementMap: reflowWidgets,
  occupiedSpacesBySiblingWidgets: OccupiedSpace[],
  collidingWidgets: OccupiedSpace[] = [],
  widgetPosition: WidgetCollisionGraph,
  direction: ResizeDirection,
  widgetParentSpaces: WidgetParentSpaces,
  dimensions = { X: 0, Y: 0 },
) {
  let accessors;
  switch (direction) {
    case ResizeDirection.LEFT:
      accessors = {
        direction: widgetDimensions.left,
        oppositeDirection: widgetDimensions.bottom,
        perpendicularMax: widgetDimensions.bottom,
        perpendicularMin: widgetDimensions.top,
        parallelMax: widgetDimensions.right,
        parallelMin: widgetDimensions.left,
        mathComparator: MathComparators.max,
        directionIndicator: -1,
        isHorizontal: true,
      };
      break;
    case ResizeDirection.RIGHT:
      accessors = {
        direction: widgetDimensions.right,
        oppositeDirection: widgetDimensions.left,
        perpendicularMax: widgetDimensions.bottom,
        perpendicularMin: widgetDimensions.top,
        parallelMax: widgetDimensions.right,
        parallelMin: widgetDimensions.left,
        mathComparator: MathComparators.min,
        directionIndicator: 1,
        isHorizontal: true,
      };
      break;
    case ResizeDirection.TOP:
      accessors = {
        direction: widgetDimensions.top,
        oppositeDirection: widgetDimensions.bottom,
        perpendicularMax: widgetDimensions.right,
        perpendicularMin: widgetDimensions.left,
        parallelMax: widgetDimensions.bottom,
        parallelMin: widgetDimensions.top,
        mathComparator: MathComparators.max,
        directionIndicator: -1,
        isHorizontal: false,
      };
      break;
    case ResizeDirection.BOTTOM:
      accessors = {
        direction: widgetDimensions.bottom,
        oppositeDirection: widgetDimensions.top,
        perpendicularMax: widgetDimensions.right,
        perpendicularMin: widgetDimensions.left,
        parallelMax: widgetDimensions.bottom,
        parallelMin: widgetDimensions.top,
        mathComparator: MathComparators.max,
        directionIndicator: 1,
        isHorizontal: false,
      };
      break;
    default:
      return;
  }
  const widgetCollisionGraph = getWidgetCollisionGraphInDirection(
    occupiedSpacesBySiblingWidgets,
    widgetPosition,
    collidingWidgets,
    accessors,
  );

  // if (initialCollidingWidget) {
  //   const isColliding =
  //     accessors.directionIndicator > 0
  //       ? widgetCollisionGraph[accessors.direction] >
  //         initialCollidingWidget[accessors.oppositeDirection]
  //       : widgetCollisionGraph[accessors.direction] <
  //         initialCollidingWidget[accessors.oppositeDirection];

  //   if (!isColliding) return;
  // }
  if (!widgetCollisionGraph) return;
  getWidgetMovementMap(
    widgetCollisionGraph,
    widgetMovementMap,
    dimensions,
    widgetParentSpaces,
    accessors,
    direction,
    0,
    widgetPosition[accessors.direction],
  );
  if (!widgetMovementMap && !widgetMovementMap[widgetCollisionGraph.id])
    return {};

  const staticWidget = widgetMovementMap[widgetCollisionGraph.id];

  delete widgetMovementMap[widgetCollisionGraph.id];

  //eslint-disable-next-line
  console.log(
    cloneDeep({
      graph: widgetCollisionGraph,
      map: widgetMovementMap,
      direction,
      accessors,
    }),
  );

  if (accessors.isHorizontal) {
    return {
      id: widgetCollisionGraph.id,
      maxX:
        (staticWidget.maxX || 0) +
        accessors.directionIndicator * dimensions.X +
        widgetParentSpaces.parentColumnSpace,
      mathXComparator: accessors.mathComparator,
      directionXIndicator: accessors.directionIndicator,
    };
  } else {
    return {
      id: widgetCollisionGraph.id,
      maxY:
        direction === ResizeDirection.BOTTOM
          ? staticWidget.maxY
          : (staticWidget.maxY || 0) -
            dimensions.Y +
            widgetParentSpaces.parentRowSpace,
      mathYComparator: accessors.mathComparator,
      directionYIndicator: accessors.directionIndicator,
    };
  }
}

export const areIntersecting = (r1: Rect, r2: Rect) => {
  return !(
    r2.left >= r1.right ||
    r2.right <= r1.left ||
    r2.top >= r1.bottom ||
    r2.bottom <= r1.top
  );
};

function getIsHorizontalMove(
  prevPositions: { X: number; Y: number },
  positions: { X: number; Y: number },
) {
  if (prevPositions.X !== positions.X) {
    return true;
  } else if (prevPositions.Y !== positions.Y) {
    return false;
  }

  return undefined;
}

function getDirectionalKeysFromWidgets(
  reflowWidgets: reflowWidgets,
): { horizontalKeys: string[]; verticalKeys: string[] } {
  const horizontalKeys: string[] = [],
    verticalKeys: string[] = [];
  if (!reflowWidgets) return { horizontalKeys, verticalKeys };

  const reflowWidgetIds = Object.keys(reflowWidgets);

  for (const reflowWidgetId of reflowWidgetIds) {
    if (reflowWidgets[reflowWidgetId]?.maxX !== undefined) {
      horizontalKeys.push(reflowWidgetId);
    } else if (reflowWidgets[reflowWidgetId]?.maxY !== undefined) {
      verticalKeys.push(reflowWidgetId);
    }
  }
  return { horizontalKeys, verticalKeys };
}

function getCollidingWidgets(
  offset: Rect,
  widgetId: string,
  occupied?: OccupiedSpace[],
) {
  let isColliding = false;
  const collidingWidgets = [];
  if (occupied) {
    occupied = occupied.filter((widgetDetails) => {
      return (
        widgetDetails.id !== widgetId && widgetDetails.parentId !== widgetId
      );
    });
    for (let i = 0; i < occupied.length; i++) {
      if (areIntersecting(occupied[i], offset)) {
        isColliding = true;
        collidingWidgets.push({ ...occupied[i] });
      }
    }
  }
  return {
    isColliding,
    collidingWidgets,
  };
}
