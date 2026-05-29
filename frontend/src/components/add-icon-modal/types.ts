import {
  IconFontSize,
  IconImageRadius,
  IconImageStyle,
  IconSize,
  IconTextAlign,
} from "../../types";
import { BUILTIN_ICON_OPTIONS, SOURCE_OPTIONS } from "./constants";

export type BuiltinIconName = (typeof BUILTIN_ICON_OPTIONS)[number];

export type IconSourceMode = (typeof SOURCE_OPTIONS)[number]["id"];

export interface AddIconPayload {
  groupId: string;
  name: string;
  url: string | null;
  sub: string | null;
  size: IconSize;
  letter: string | null;
  color: number;
  iframePreview: boolean;
  imageUrl: string | null;
  imageStyle: IconImageStyle;
  imageRadius: IconImageRadius;
  fontSize: IconFontSize;
  textAlign: IconTextAlign;
}
