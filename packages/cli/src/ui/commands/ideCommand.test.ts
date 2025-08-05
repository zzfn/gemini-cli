/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MockInstance,
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import { ideCommand } from './ideCommand.js';
import { type CommandContext } from './types.js';
import { type Config, DetectedIde } from '@google/gemini-cli-core';
import * as core from '@google/gemini-cli-core';

vi.mock('child_process');
vi.mock('glob');
vi.mock('@google/gemini-cli-core');

describe('ideCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let platformSpy: MockInstance;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
      services: {
        settings: {
          setValue: vi.fn(),
        },
      },
    } as unknown as CommandContext;

    mockConfig = {
      getIdeModeFeature: vi.fn(),
      getIdeMode: vi.fn(),
      getIdeClient: vi.fn(),
      setIdeMode: vi.fn(),
      setIdeClientDisconnected: vi.fn(),
    } as unknown as Config;

    platformSpy = vi.spyOn(process, 'platform', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if ideModeFeature is not enabled', () => {
    vi.mocked(mockConfig.getIdeModeFeature).mockReturnValue(false);
    const command = ideCommand(mockConfig);
    expect(command).toBeNull();
  });

  it('should return the ide command if ideModeFeature is enabled', () => {
    vi.mocked(mockConfig.getIdeModeFeature).mockReturnValue(true);
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
    vi.mocked(mockConfig.getIdeClient).mockReturnValue({
      getCurrentIde: () => DetectedIde.VSCode,
      getDetectedIdeDisplayName: () => 'VS Code',
    } as ReturnType<Config['getIdeClient']>);
    const command = ideCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('ide');
    expect(command?.subCommands).toHaveLength(3);
    expect(command?.subCommands?.[0].name).toBe('disable');
    expect(command?.subCommands?.[1].name).toBe('status');
    expect(command?.subCommands?.[2].name).toBe('install');
  });

  describe('status subcommand', () => {
    const mockGetConnectionStatus = vi.fn();
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeModeFeature).mockReturnValue(true);
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getConnectionStatus: mockGetConnectionStatus,
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
      } as unknown as ReturnType<Config['getIdeClient']>);
    });

    it('should show connected status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Connected,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands!.find((c) => c.name === 'status')!
        .action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '🟢 Connected to VS Code',
      });
    });

    it('should show connecting status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Connecting,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands!.find((c) => c.name === 'status')!
        .action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `🟡 Connecting...`,
      });
    });
    it('should show disconnected status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Disconnected,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands!.find((c) => c.name === 'status')!
        .action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected`,
      });
    });

    it('should show disconnected status with details', () => {
      const details = 'Something went wrong';
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Disconnected,
        details,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands!.find((c) => c.name === 'status')!
        .action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected: ${details}`,
      });
    });
  });

  describe('install subcommand', () => {
    const mockInstall = vi.fn();
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeModeFeature).mockReturnValue(true);
      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getConnectionStatus: vi.fn(),
        getDetectedIdeDisplayName: () => 'VS Code',
      } as unknown as ReturnType<Config['getIdeClient']>);
      vi.mocked(core.getIdeInstaller).mockReturnValue({
        install: mockInstall,
        isInstalled: vi.fn(),
      });
      platformSpy.mockReturnValue('linux');
    });

    it('should install the extension', async () => {
      mockInstall.mockResolvedValue({
        success: true,
        message: 'Successfully installed.',
      });

      const command = ideCommand(mockConfig);
      await command!.subCommands!.find((c) => c.name === 'install')!.action!(
        mockContext,
        '',
      );

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing IDE companion...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'Successfully installed.',
        }),
        expect.any(Number),
      );
    });

    it('should show an error if installation fails', async () => {
      mockInstall.mockResolvedValue({
        success: false,
        message: 'Installation failed.',
      });

      const command = ideCommand(mockConfig);
      await command!.subCommands!.find((c) => c.name === 'install')!.action!(
        mockContext,
        '',
      );

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing IDE companion...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: 'Installation failed.',
        }),
        expect.any(Number),
      );
    });
  });
});
