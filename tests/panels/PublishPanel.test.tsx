import React from "react";
import { render, screen } from "@testing-library/react";
import { PublishPanel } from "../../src/panels/PublishPanel";

const mockMediaService = {
  add: jest.fn().mockResolvedValue({ id: "e-1", name: "Test" }),
  update: jest.fn().mockResolvedValue({ id: "e-1", name: "Updated" }),
} as never;

const mockUploadService = {
  createToken: jest.fn().mockResolvedValue({ id: "tok-1" }),
} as never;

const mockMetadataService = {
  listCategories: jest.fn().mockResolvedValue([]),
} as never;

const mockPremiereService = {
  isAvailable: jest.fn().mockReturnValue(false),
  getActiveSequence: jest.fn().mockResolvedValue(null),
} as never;

const mockOnPublished = jest.fn();

const defaultProps = {
  mediaService: mockMediaService,
  uploadService: mockUploadService,
  metadataService: mockMetadataService,
  premiereService: mockPremiereService,
  onPublished: mockOnPublished,
};

describe("PublishPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders publish form with heading", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Publish to Kaltura")).toBeTruthy();
  });

  it("shows title label", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Title *")).toBeTruthy();
  });

  it("shows publish mode picker options", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("New Entry")).toBeTruthy();
    expect(screen.getByText("Update Existing")).toBeTruthy();
  });

  it("shows publish mode label", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Publish Mode")).toBeTruthy();
  });

  it("shows description and tags fields", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();
  });

  it("shows publish button", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Publish")).toBeTruthy();
  });
});
