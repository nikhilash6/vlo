import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectSettingsMenu } from "../ProjectSettingsMenu";
import { useProjectStore } from "../../../features/project";

describe("ProjectSettingsMenu", () => {
  beforeEach(() => {
    useProjectStore.setState({
      config: {
        aspectRatio: "16:9",
        fps: 30,
        layoutMode: "compact",
        assetBrowserDisplay: "grouped",
      },
    });
  });

  it("does not render generation resolution controls", () => {
    render(<ProjectSettingsMenu />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByText("RESOLUTION")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Resolution")).not.toBeInTheDocument();
  });

  it("offers grouped and ungrouped asset browser display options", () => {
    render(<ProjectSettingsMenu />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("ASSET BROWSER")).toBeInTheDocument();
    expect(screen.getByText("Grouped assets")).toBeInTheDocument();
    expect(screen.getByText("Ungrouped assets")).toBeInTheDocument();
  });
});
