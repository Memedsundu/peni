/**
 * İlan mobile primitives (design-system.md §12.5). Import from "@/components/ui".
 * Visual QA for every variant and state: the `/kit` route (dev builds, or EXPO_PUBLIC_KIT=1).
 */
export { T, type TProps, type TypeVariant } from "./t";
export { Icon, iconStroke, withAlpha, type IconProp, type IconProps, type IconSize } from "./icon";
export { PressableScale, type PressableScaleProps } from "./pressable-scale";
export { Spinner, type SpinnerProps } from "./spinner";
export { Button, ButtonRow, type ButtonProps, type ButtonVariant, type ButtonSize } from "./button";
export { IconButton, type IconButtonProps, type IconButtonVariant, type IconButtonSize } from "./icon-button";
export { Stepper, type StepperProps } from "./stepper";
export { Segmented, type SegmentedProps, type SegmentedItem } from "./segmented";
export {
  Chip,
  ChipGroup,
  StatusDot,
  type ChipProps,
  type ChipTone,
  type ChipKind,
  type StatusChipProps,
  type TagChipProps,
  type ChoiceChipProps,
} from "./chip";
export { Card, type CardProps, type CardTone, type CardPadding } from "./card";
export { Row, RowGroup, type RowProps, type RowGroupProps } from "./row";
export { Banner, type BannerProps, type BannerTone } from "./banner";
export { EmptyState, type EmptyStateProps, type EmptyStateAction } from "./empty-state";
export { Skeleton, skeletonLineHeight, type SkeletonProps, type SkeletonRadius } from "./skeleton";
export { Field, FieldFrame, Input, type FieldProps, type FieldFrameProps, type InputProps } from "./field";
export { SwitchRow, Switch, type SwitchRowProps, type SwitchProps } from "./switch-row";
export {
  ToastHost,
  toast,
  toastUndo,
  dismissToast,
  TOAST_DURATION,
  UNDO_DURATION,
  type ToastTone,
  type ToastAction,
  type ToastOptions,
  type UndoToastOptions,
} from "./toast";
export { CountWheel, NumberRoll, type CountWheelProps, type NumberRollProps, type NumberRollKind } from "./count-wheel";
