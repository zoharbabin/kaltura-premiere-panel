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

  it("renders publish mode segmented control", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("New Entry")).toBeTruthy();
    expect(screen.getByText("Replace Existing")).toBeTruthy();
  });

  it("shows title field label", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Title *")).toBeTruthy();
  });

  it("shows description and tags fields inside Basic Info", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();
  });

  it("shows Kaltura-branded publish button", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("Publish to Kaltura")).toBeTruthy();
  });

  it("shows Publishing Options accordion for new entries", () => {
    render(<PublishPanel {...defaultProps} />);
    expect(screen.getByText("PUBLISHING OPTIONS")).toBeTruthy();
  });
});
