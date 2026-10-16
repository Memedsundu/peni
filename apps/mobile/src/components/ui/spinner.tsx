/**
 * The one spinner the system allows (§7.1): `LoaderCircle` turning while a request is in
 * flight. It is the only infinite animation in the product, and under reduced motion it stands
 * still — the text beside it ("Gönderiliyor…") says what is happening.
 */
import { LoaderCircle } from "lucide-react-native";
import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Icon } from "./icon";

export interface SpinnerProps {
  color: string;
  size?: 16 | 20 | 24;
}

export function Spinner({ color, size = 20 }: SpinnerProps) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    turn.set(0);
    turn.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [reduced, turn]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));

  return (
    <Animated.View
      aria-hidden
      style={[{ width: size, height: size }, reduced ? null : style]}
    >
      <Icon icon={LoaderCircle} size={size} color={color} />
    </Animated.View>
  );
}
