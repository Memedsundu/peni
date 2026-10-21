import { fill as customerFill, onePenny } from "@peni/api/customer-text";
import { describe, expect, it } from "vitest";
import { fill as panelFill } from "../app/panel/text";

describe("Counting pennies in English (N9)", () => {
  it("says 1 penny and 11 pennies, and leaves Turkish as it is", () => {
    expect(customerFill("Treat {name} to {n} pennies", { name: "Ayşe", n: 1 })).toBe("Treat Ayşe to 1 penny");
    expect(customerFill("Treat {name} to {n} pennies", { name: "Ayşe", n: 11 })).toBe("Treat Ayşe to 11 pennies");
    expect(panelFill("{n} pennies on the askı", { n: 1 })).toBe("1 penny on the askı");
    expect(onePenny("You earn 1 pennies with this order.")).toBe("You earn 1 penny with this order.");
    expect(onePenny("1.250 pennies")).toBe("1.250 pennies");
    expect(customerFill("Askıya {n} penny bırak", { n: 1 })).toBe("Askıya 1 penny bırak");
  });
});
