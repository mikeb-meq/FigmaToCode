import { indentString } from "../common/indentString";
import { className, sliceNum } from "../common/numToAutoFixed";
import { SwiftuiTextBuilder } from "./swiftuiTextBuilder";
import { SwiftuiDefaultBuilder } from "./swiftuiDefaultBuilder";
import { PluginSettings } from "../code";

let localSettings: PluginSettings;

const getStructTemplate = (name: string, injectCode: string): string =>
  `struct ${name}: View {
  var body: some View {
    ${indentString(injectCode, 4).trimStart()};
  }
}`;

const getPreviewTemplate = (name: string, injectCode: string): string =>
  `import SwiftUI

struct ContentView: View {
  var body: some View {
    ${indentString(injectCode, 4).trimStart()};
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView()
  }
}`;

export const swiftuiMain = (
  sceneNode: Array<SceneNode>,
  settings: PluginSettings
): string => {
  localSettings = settings;
  let result = swiftuiWidgetGenerator(sceneNode, 0);

  switch (localSettings.swiftUIGenerationMode) {
    case "snippet":
      return result;
    case "struct":
      // result = generateWidgetCode("Column", { children: [result] });
      return getStructTemplate(className(sceneNode[0].name), result);
    case "preview":
      // result = generateWidgetCode("Column", { children: [result] });
      return getPreviewTemplate(className(sceneNode[0].name), result);
  }

  // remove the initial \n that is made in Container.
  if (result.length > 0 && result.startsWith("\n")) {
    result = result.slice(1, result.length);
  }

  return result;
};

const swiftuiWidgetGenerator = (
  sceneNode: ReadonlyArray<SceneNode>,
  indentLevel: number
): string => {
  let comp = "";

  // filter non visible nodes. This is necessary at this step because conversion already happened.
  const visibleSceneNode = sceneNode.filter((d) => d.visible);
  const sceneLen = visibleSceneNode.length;

  visibleSceneNode.forEach((node, index) => {
    if (node.type === "RECTANGLE" || node.type === "ELLIPSE") {
      comp += swiftuiContainer(node, indentLevel);
    } else if (node.type === "GROUP") {
      comp += swiftuiGroup(node, indentLevel);
    } else if (node.type === "FRAME") {
      comp += swiftuiFrame(node, indentLevel);
    } else if (node.type === "TEXT") {
      comp += swiftuiText(node, indentLevel);
    }

    // don't add a newline at last element.
    if (index < sceneLen - 1) {
      comp += "\n";
    }
  });

  return comp;
};

// properties named propSomething always take care of ","
// sometimes a property might not exist, so it doesn't add ","
export const swiftuiContainer = (
  node: SceneNode,
  indentLevel: number,
  stack: string = ""
): string => {
  if (!("layoutAlign" in node) || !("opacity" in node)) {
    return "";
  }

  // ignore the view when size is zero or less
  // while technically it shouldn't get less than 0, due to rounding errors,
  // it can get to values like: -0.000004196293048153166
  if (node.width <= 0 || node.height <= 0) {
    return stack;
  }

  let kind = "";
  if (node.type === "RECTANGLE") {
    kind = "Rectangle()";
  } else if (node.type === "ELLIPSE") {
    kind = "Ellipse()";
  } else {
    kind = stack;
  }

  const result = new SwiftuiDefaultBuilder(kind)
    .shapeForeground(node)
    .autoLayoutPadding(node, localSettings.optimizeLayout)
    .size(node)
    .shapeBackground(node)
    .cornerRadius(node)
    .shapeBorder(node)
    .commonPositionStyles(node, localSettings.optimizeLayout)
    .effects(node)
    .build(kind === stack ? -2 : 0);

  return indentString(result, indentLevel);
};

const swiftuiGroup = (node: GroupNode, indentLevel: number): string => {
  return swiftuiContainer(
    node,
    indentLevel,
    `\nZStack {${widgetGeneratorWithLimits(node, indentLevel)}\n}`
  );
};

const swiftuiText = (node: TextNode, indentLevel: number): string => {
  const builder = new SwiftuiTextBuilder();

  let text = node.characters;
  if (node.textCase === "LOWER") {
    text = text.toLowerCase();
  } else if (node.textCase === "UPPER") {
    text = text.toUpperCase();
  }

  const splittedChars = text.split("\n");
  const charsWithLineBreak =
    splittedChars.length > 1 ? splittedChars.join("\\n") : text;

  const modifier = builder
    .textDecoration(node)
    .textStyle(node)
    .textAutoSize(node)
    .letterSpacing(node)
    .lineHeight(node)
    .commonPositionStyles(node, localSettings.optimizeLayout)
    .fillColor(node)
    .position(node, localSettings.optimizeLayout)
    .build();

  const result = `\nText("${charsWithLineBreak}")${modifier}`;
  return indentString(result, indentLevel);
};

const swiftuiFrame = (node: FrameNode, indentLevel: number): string => {
  const children = widgetGeneratorWithLimits(
    node,
    node.children.length > 1 ? indentLevel + 1 : indentLevel
  );

  // if (node.children.length === 1) {
  //   return swiftuiContainer(node, indentLevel, children);
  // } else {
  const anyStack = createDirectionalStack(
    children,
    localSettings.optimizeLayout && node.inferredAutoLayout !== null
      ? node.inferredAutoLayout
      : node
  );
  return swiftuiContainer(node, indentLevel, anyStack);
  // }
};

const createDirectionalStack = (
  children: string,
  inferredAutoLayout: inferredAutoLayoutResult
): string => {
  if (inferredAutoLayout.layoutMode !== "NONE") {
    return generateSwiftViewCode(
      inferredAutoLayout.layoutMode === "HORIZONTAL" ? "HStack" : "VStack",
      {
        alignment: getLayoutAlignment(inferredAutoLayout),
        spacing: getSpacing(inferredAutoLayout),
      },
      children
    );
  } else {
    return generateSwiftViewCode("ZStack", {}, children);
  }
};

const getLayoutAlignment = (
  inferredAutoLayout: inferredAutoLayoutResult
): string => {
  switch (inferredAutoLayout.counterAxisAlignItems) {
    case "MIN":
      return inferredAutoLayout.layoutMode === "VERTICAL" ? ".leading" : ".top";
    case "MAX":
      return inferredAutoLayout.layoutMode === "VERTICAL"
        ? ".trailing"
        : ".bottom";
    case "BASELINE":
      return ".firstTextBaseline";
    case "CENTER":
      return "";
  }
};

const getSpacing = (inferredAutoLayout: inferredAutoLayoutResult): number => {
  const defaultSpacing = 16;
  return Math.round(inferredAutoLayout.itemSpacing) !== defaultSpacing
    ? inferredAutoLayout.itemSpacing
    : defaultSpacing;
};

export const generateSwiftViewCode = (
  className: string,
  properties: Record<string, string | number>,
  children: string
): string => {
  const propertiesArray = Object.entries(properties)
    .filter(([, value]) => value !== "")
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "number" ? sliceNum(value) : value}`
    );

  const compactPropertiesArray = propertiesArray.join(", ");
  if (compactPropertiesArray.length > 60) {
    const formattedProperties = propertiesArray.join(",\n");
    return `${className}(\n${formattedProperties}\n) {${children}\n}`;
  }

  return `${className}(${compactPropertiesArray}) {\n${indentString(
    children
  )}\n}`;
};

// todo should the plugin manually Group items? Ideally, it would detect the similarities and allow a ForEach.
const widgetGeneratorWithLimits = (
  node: FrameNode | GroupNode,
  indentLevel: number
) => {
  if (node.children.length < 10) {
    // standard way
    return swiftuiWidgetGenerator(node.children, indentLevel);
  }

  const chunk = 10;
  let strBuilder = "";
  const slicedChildren = node.children.slice(0, 100);

  // I believe no one should have more than 100 items in a single nesting level. If you do, please email me.
  if (node.children.length > 100) {
    strBuilder += `\n// SwiftUI has a 10 item limit in Stacks. By grouping them, it can grow even more. 
// It seems, however, that you have more than 100 items at the same level. Wow!
// This is not yet supported; Limiting to the first 100 items...`;
  }

  // split node.children in arrays of 10, so that it can be Grouped. I feel so guilty of allowing this.
  for (let i = 0, j = slicedChildren.length; i < j; i += chunk) {
    const chunkChildren = slicedChildren.slice(i, i + chunk);
    const strChildren = swiftuiWidgetGenerator(chunkChildren, indentLevel);
    strBuilder += `\nGroup {${strChildren}\n}`;
  }

  return strBuilder;
};