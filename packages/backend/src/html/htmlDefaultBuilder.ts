import { formatWithJSX } from "../common/parseJSX";
import { htmlShadow } from "./builderImpl/htmlShadow";
import {
  htmlVisibility,
  htmlRotation,
  htmlOpacity,
  htmlBlendMode,
} from "./builderImpl/htmlBlend";
import {
  htmlColor,
  htmlColorFromFills,
  htmlGradientFromFills,
} from "./builderImpl/htmlColor";
import { htmlPadding } from "./builderImpl/htmlPadding";
import { htmlSizePartial } from "./builderImpl/htmlSize";
import { htmlBorderRadius } from "./builderImpl/htmlBorderRadius";
import {
  commonIsAbsolutePosition,
  getCommonPositionValue,
} from "../common/commonPosition";
import { className, sliceNum } from "../common/numToAutoFixed";
import { commonStroke } from "../common/commonStroke";

export class HtmlDefaultBuilder {
  styles: Array<string>;
  isJSX: boolean;
  visible: boolean;
  node: any;
  name: string = "";

  constructor(node: any, showLayerName: boolean, optIsJSX: boolean) {
    this.isJSX = optIsJSX;
    this.styles = [];
    this.visible = node.visible;
    this.node = node;

    // Keep for debugging
    // console.log('HtmlDefaultBuilder node', node);

    if (showLayerName) {
      this.name = className(node.name);
    }
  }

  commonPositionStyles(
    node: SceneNode & LayoutMixin & MinimalBlendMixin,
    optimizeLayout: boolean
  ): this {
    this.size(node, optimizeLayout);
    this.autoLayoutPadding(node, optimizeLayout);
    this.position(node, optimizeLayout);
    this.blend(node);
    return this;
  }

  commonShapeStyles(node: GeometryMixin & SceneNode): this {
    this.applyFillsToStyle(
      node.fills,
      node.type === "TEXT" ? "text" : "background"
    );
    this.shadow(node);
    this.border(node);
    this.blur(node);
    return this;
  }

  addStyles = (...newStyles: string[]) => {
    this.styles.push(...newStyles.filter((style) => style));
  };

  blend(node: SceneNode & LayoutMixin & MinimalBlendMixin): this {
    this.addStyles(
      htmlVisibility(node, this.isJSX),
      ...htmlRotation(node, this.isJSX),
      htmlOpacity(node, this.isJSX),
      htmlBlendMode(node, this.isJSX)
    );
    return this;
  }

  border(node: GeometryMixin & SceneNode): this {
    this.addStyles(...htmlBorderRadius(node, this.isJSX));

    const commonBorder = commonStroke(node);
    if (!commonBorder) {
      return this;
    }

    const color = htmlColorFromFills(node.strokes);
    const borderStyle = node.dashPattern.length > 0 ? "dotted" : "solid";

    const consolidateBorders = (border: number): string =>
      [`${sliceNum(border)}px`, color, borderStyle].filter((d) => d).join(" ");

    if ("all" in commonBorder) {
      if (commonBorder.all === 0) {
        return this;
      }
      const weight = commonBorder.all;
      this.addStyles(
        formatWithJSX("border", this.isJSX, consolidateBorders(weight))
      );
    } else {
      if (commonBorder.left !== 0) {
        this.addStyles(
          formatWithJSX(
            "border-left",
            this.isJSX,
            consolidateBorders(commonBorder.left)
          )
        );
      }
      if (commonBorder.top !== 0) {
        this.addStyles(
          formatWithJSX(
            "border-top",
            this.isJSX,
            consolidateBorders(commonBorder.top)
          )
        );
      }
      if (commonBorder.right !== 0) {
        this.addStyles(
          formatWithJSX(
            "border-right",
            this.isJSX,
            consolidateBorders(commonBorder.right)
          )
        );
      }
      if (commonBorder.bottom !== 0) {
        this.addStyles(
          formatWithJSX(
            "border-bottom",
            this.isJSX,
            consolidateBorders(commonBorder.bottom)
          )
        );
      }
    }
    return this;
  }

  position(node: SceneNode, optimizeLayout: boolean): this {
    if (commonIsAbsolutePosition(node, optimizeLayout)) {
      const { x, y } = getCommonPositionValue(node);

      this.addStyles(
        formatWithJSX("left", this.isJSX, x),
        formatWithJSX("top", this.isJSX, y),
        formatWithJSX("position", this.isJSX, "absolute")
      );
    } else {
      if (
        node.type === "GROUP" ||
        ("layoutMode" in node &&
          ((optimizeLayout ? node.inferredAutoLayout : null) ?? node)
            ?.layoutMode === "NONE")
      ) {
        this.addStyles(formatWithJSX("position", this.isJSX, "relative"));
      }
    }

    return this;
  }

  applyFillsToStyle(
    paintArray: ReadonlyArray<Paint> | PluginAPI["mixed"],
    property: "text" | "background"
  ): this {
    if (property === "text") {
      this.addStyles(
        formatWithJSX("text", this.isJSX, htmlColorFromFills(paintArray))
      );
      return this;
    }

    const backgroundValues = this.buildBackgroundValues(paintArray);
    if (backgroundValues) {
      this.addStyles(formatWithJSX("background", this.isJSX, backgroundValues));
    }

    return this;
  }

  buildBackgroundValues(
    paintArray: ReadonlyArray<Paint> | PluginAPI["mixed"]
  ): string {
    if (paintArray === figma.mixed) {
      return "";
    }

    // If one fill and it's a solid, return the solid RGB color
    if (paintArray.length === 1 && paintArray[0].type === "SOLID") {
      return htmlColorFromFills(paintArray);
    }

    // If multiple fills, deal with gradients and convert solid colors to a "dumb" linear-gradient
    const styles = paintArray.map((paint) => {
      if (paint.type === "SOLID") {
        const color = htmlColorFromFills([paint]);
        return `linear-gradient(0deg, ${color} 0%, ${color} 100%)`;
      } else if (
        paint.type === "GRADIENT_LINEAR" ||
        paint.type === "GRADIENT_RADIAL" ||
        paint.type === "GRADIENT_ANGULAR"
      ) {
        return htmlGradientFromFills([paint]);
      }

      return ""; // Handle other paint types safely
    });

    return styles.filter((value) => value !== "").join(", ");
  }

  shadow(node: SceneNode): this {
    if ("effects" in node) {
      const shadow = htmlShadow(node);
      if (shadow) {
        this.addStyles(
          formatWithJSX("box-shadow", this.isJSX, htmlShadow(node))
        );
      }
    }
    return this;
  }

  size(node: SceneNode, optimize: boolean): this {
    const { width, height } = htmlSizePartial(node, this.isJSX, optimize);

    if (node.type === "TEXT") {
      switch (node.textAutoResize) {
        case "WIDTH_AND_HEIGHT":
          break;
        case "HEIGHT":
          this.addStyles(width);
          break;
        case "NONE":
        case "TRUNCATE":
          this.addStyles(width, height);
          break;
      }
    } else {
      this.addStyles(width, height);
    }

    return this;
  }

  autoLayoutPadding(node: SceneNode, optimizeLayout: boolean): this {
    if ("paddingLeft" in node) {
      this.addStyles(
        ...htmlPadding(
          (optimizeLayout ? node.inferredAutoLayout : null) ?? node,
          this.isJSX
        )
      );
    }
    return this;
  }

  blur(node: SceneNode) {
    if ("effects" in node && node.effects.length > 0) {
      const blur = node.effects.find(
        (e) => e.type === "LAYER_BLUR" && e.visible
      );
      if (blur) {
        this.addStyles(
          formatWithJSX(
            "filter",
            this.isJSX,
            `blur(${sliceNum(blur.radius)}px)`
          )
        );
      }

      const backgroundBlur = node.effects.find(
        (e) => e.type === "BACKGROUND_BLUR" && e.visible
      );
      if (backgroundBlur) {
        this.addStyles(
          formatWithJSX(
            "backdrop-filter",
            this.isJSX,
            `blur(${sliceNum(backgroundBlur.radius)}px)`
          )
        );
      }
    }
  }

  build(additionalStyle: Array<string> = []): string {
    this.addStyles(...additionalStyle);

    const formattedStyles = this.styles.map((s) => s.trim());

    const formattedStylesFiltered = formattedStyles.filter((s) => {
        const styleProp = s.split(":")[0].trim();

        if (styleProp === "width") {
            return (this.node.layoutSizingHorizontal === "FIXED");
        } else if (styleProp === "height") {
            return (this.node.layoutSizingVertical === "FIXED");
        }
        return true;
    });

    let formattedStyle = "";
    if (this.styles.length > 0) {
      if (this.isJSX) {
        formattedStyle = ` style={{${formattedStylesFiltered.join(", ")}}}`;
      } else {
        formattedStyle = ` style="${formattedStylesFiltered.join("; ")}"`;
      }
    }

    formattedStyle = ` data-fig-type="${this.node.type}"${formattedStyle}`;

    if (this.node.type === 'TEXT' && this.node.textStyleId) {
        let textStyleId = this.node.textStyleId;
        let typogVarName;

        if (typeof textStyleId === 'string') {
            typogVarName = figma.getStyleById(textStyleId).name;
            formattedStyle = ` data-fig-typog-var="${typogVarName}"${formattedStyle}`;
        }
    }

    const extraProps: Record<string, Record<string, string>> = {};

    if (this.node.type === "INSTANCE") {
        if (this.node.name === "Nav Button") {
            formattedStyle = ` data-fig-cmp-type="IconButton"${formattedStyle}`;

            extraProps['_width'] = { value: String(this.node.width) };

            if (this.node.children?.length === 1 && this.node.children[0].type === "FRAME") {
                const childNode = this.node.children[0];

                if (childNode.children?.length === 1 && childNode.children[0].type === "INSTANCE") {
                    extraProps['_icon'] = { value: childNode.children[0].name };
                }
            }
        } else {
            formattedStyle = ` data-fig-cmp-type="${this.node.name}"${formattedStyle}`;
        }
    }

    if (this.node.type === "TEXT" && this.node.fontName?.family?.includes('Font Awesome')) {
        formattedStyle = ` data-fig-cmp-type="SvgIcon"${formattedStyle}`;

        extraProps['_fill'] = { value: figma.getStyleById(this.node.fillStyleId).name };
    }

    if (this.node.type === "VECTOR") {
        formattedStyle = ` data-fig-cmp-type="SvgIcon"${formattedStyle}`;
    }

    if (this.node.type === "RECTANGLE" && this.node.fills && this.node.fills[0]?.type === "IMAGE") {
        formattedStyle = ` data-fig-cmp-type="Image"${formattedStyle}`;
    }

    const props = {...this.node.componentProperties, ...extraProps};

    if (props && Object.keys(props).length > 0) {
        Object.keys(props).forEach((key) => {
            let newKey = key;

            if (key.includes("#")) {
                newKey = key.split("#")[0];
                props[newKey] = props[key];
                delete props[key];
            }
            props[newKey] = props[newKey].value;         
        });

        // Encode prop values in a format that doesn't require escaping in JSON
        const propsStr = JSON.stringify(props)
            .replace(/\\"/g, "[quote]")
            .replace(/"/g, "``");
        formattedStyle = ` data-fig-props="${propsStr}"${formattedStyle}`;
    }

    if (this.name.length > 0) {
      const classOrClassName = this.isJSX ? "className" : "class";
      return ` ${classOrClassName}="${this.name}"${formattedStyle}`;
    } else {
      return formattedStyle;
    }
  }
}
