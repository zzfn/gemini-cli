/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCommandCompletion } from './useCommandCompletion.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { useTextBuffer } from '../components/shared/text-buffer.js';

describe('useCommandCompletion', () => {
  let testRootDir: string;
  let mockConfig: Config;

  // A minimal mock is sufficient for these tests.
  const mockCommandContext = {} as CommandContext;
  let testDirs: string[];

  async function createEmptyDir(...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async function createTestFile(content: string, ...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  // Helper to create real TextBuffer objects within renderHook
  function useTextBufferForTest(text: string, cursorOffset?: number) {
    return useTextBuffer({
      initialText: text,
      initialCursorOffset: cursorOffset ?? text.length,
      viewport: { width: 80, height: 20 },
      isValidPath: () => false,
      onChange: () => {},
    });
  }

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'slash-completion-unit-test-'),
    );
    testDirs = [testRootDir];
    mockConfig = {
      getTargetDir: () => testRootDir,
      getWorkspaceContext: () => ({
        getDirectories: () => testDirs,
      }),
      getProjectRoot: () => testRootDir,
      getFileFilteringOptions: vi.fn(() => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      })),
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getFileService: vi.fn(() => new FileDiscoveryService(testRootDir)),
    } as unknown as Config;

    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('Core Hook Behavior', () => {
    describe('State Management', () => {
      it('should initialize with default state', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(''),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset state when isActive becomes false', () => {
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];

        const { result, rerender } = renderHook(
          ({ text }) => {
            const textBuffer = useTextBufferForTest(text);
            return useCommandCompletion(
              textBuffer,
              testDirs,
              testRootDir,
              slashCommands,
              mockCommandContext,
              false,
              mockConfig,
            );
          },
          { initialProps: { text: '/help' } },
        );

        // Inactive because of the leading space
        rerender({ text: ' /help' });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset all state to default values', async () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/help'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        act(() => {
          result.current.setActiveSuggestionIndex(5);
          result.current.setShowSuggestions(true);
        });

        act(() => {
          result.current.resetCompletionState();
        });

        // Wait for async suggestions clearing
        await waitFor(() => {
          expect(result.current.suggestions).toEqual([]);
        });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });
    });

    describe('Navigation', () => {
      it('should handle navigateUp with no suggestions', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(''),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should handle navigateDown with no suggestions', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(''),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should navigate up through suggestions with wrap-around', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/h'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(1);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should navigate down through suggestions with wrap-around', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/h'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(1);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should handle navigation with multiple suggestions', () => {
        const slashCommands = [
          { name: 'help', description: 'Show help' },
          { name: 'stats', description: 'Show stats' },
          { name: 'clear', description: 'Clear screen' },
          { name: 'memory', description: 'Manage memory' },
          { name: 'chat', description: 'Manage chat' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(5);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateDown();
        });
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => {
          result.current.navigateDown();
        });
        expect(result.current.activeSuggestionIndex).toBe(2);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(4);
      });

      it('should handle navigation with large suggestion lists and scrolling', () => {
        const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
          name: `command${i}`,
          description: `Command ${i}`,
        })) as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/command'),
            testDirs,
            testRootDir,
            largeMockCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(15);
        expect(result.current.activeSuggestionIndex).toBe(0);
        expect(result.current.visibleStartIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(14);
        expect(result.current.visibleStartIndex).toBe(Math.max(0, 15 - 8));
      });
    });
  });

  describe('Slash Command Completion (`/`)', () => {
    describe('Top-Level Commands', () => {
      it('should suggest all top-level commands for the root slash', async () => {
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
          },
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
          {
            name: 'clear',
            description: 'Clear the screen',
          },
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
            ],
          },
          {
            name: 'chat',
            description: 'Manage chat history',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions.length).toBe(slashCommands.length);
        expect(result.current.suggestions.map((s) => s.label)).toEqual(
          expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
        );
      });

      it('should filter commands based on partial input', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/mem'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'memory', value: 'memory', description: 'Manage memory' },
        ]);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should suggest commands based on partial altNames', async () => {
        const slashCommands = [
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/usag'), // part of the word "usage"
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          {
            label: 'stats',
            value: 'stats',
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ]);
      });

      it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/clear'), // No trailing space
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it.each([['/?'], ['/usage']])(
        'should not suggest commands when altNames is fully typed',
        async (query) => {
          const mockSlashCommands = [
            {
              name: 'help',
              altNames: ['?'],
              description: 'Show help',
              action: vi.fn(),
            },
            {
              name: 'stats',
              altNames: ['usage'],
              description: 'check session stats. Usage: /stats [model|tools]',
              action: vi.fn(),
            },
          ] as unknown as SlashCommand[];

          const { result } = renderHook(() =>
            useCommandCompletion(
              useTextBufferForTest(query),
              testDirs,
              testRootDir,
              mockSlashCommands,
              mockCommandContext,
            ),
          );

          expect(result.current.suggestions).toHaveLength(0);
        },
      );

      it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/clear '),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it('should not provide suggestions for an unknown command', async () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/unknown-command'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Sub-Commands', () => {
      it('should suggest sub-commands for a parent command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/memory'), // Note: no trailing space
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        // Assert that suggestions for sub-commands are shown immediately
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'show', value: 'show', description: 'Show memory' },
            { label: 'add', value: 'add', description: 'Add to memory' },
          ]),
        );
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/memory'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'show', value: 'show', description: 'Show memory' },
            { label: 'add', value: 'add', description: 'Add to memory' },
          ]),
        );
      });

      it('should filter sub-commands by prefix', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/memory a'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]);
      });

      it('should provide no suggestions for an invalid sub-command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/memory dothisnow'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Argument Completion', () => {
      it('should call the command.completion function for argument suggestions', async () => {
        const availableTags = [
          'my-chat-tag-1',
          'my-chat-tag-2',
          'another-channel',
        ];
        const mockCompletionFn = vi
          .fn()
          .mockImplementation(
            async (_context: CommandContext, partialArg: string) =>
              availableTags.filter((tag) => tag.startsWith(partialArg)),
          );

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/chat resume my-ch'),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(
          mockCommandContext,
          'my-ch',
        );

        expect(result.current.suggestions).toEqual([
          { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
          { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
        ]);
      });

      it('should call command.completion with an empty string when args start with a space', async () => {
        const mockCompletionFn = vi
          .fn()
          .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/chat resume '),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
        expect(result.current.suggestions).toHaveLength(3);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should handle completion function that returns null', async () => {
        const completionFn = vi.fn().mockResolvedValue(null);
        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: completionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/chat resume '),
            testDirs,
            testRootDir,
            slashCommands,
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });
  });

  describe('File Path Completion (`@`)', () => {
    describe('Basic Completion', () => {
      it('should use glob for top-level @ completions when available', async () => {
        await createTestFile('', 'src', 'index.ts');
        await createTestFile('', 'derp', 'script.ts');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@s'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'derp/script.ts',
              value: 'derp/script.ts',
            },
            { label: 'src', value: 'src' },
          ]),
        );
      });

      it('should handle directory-specific completions with git filtering', async () => {
        await createEmptyDir('.git');
        await createTestFile('*.log', '.gitignore');
        await createTestFile('', 'src', 'component.tsx');
        await createTestFile('', 'src', 'temp.log');
        await createTestFile('', 'src', 'index.ts');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@src/comp'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Should filter out .log files but include matching .tsx files
        expect(result.current.suggestions).toEqual([
          { label: 'component.tsx', value: 'component.tsx' },
        ]);
      });

      it('should include dotfiles in glob search when input starts with a dot', async () => {
        await createTestFile('', '.env');
        await createTestFile('', '.gitignore');
        await createTestFile('', 'src', 'index.ts');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@.'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toEqual([
          { label: '.env', value: '.env' },
          { label: '.gitignore', value: '.gitignore' },
        ]);
      });
    });

    describe('Configuration-based Behavior', () => {
      it('should not perform recursive search when disabled in config', async () => {
        const mockConfigNoRecursive = {
          ...mockConfig,
          getEnableRecursiveFileSearch: vi.fn(() => false),
        } as unknown as Config;

        await createEmptyDir('data');
        await createEmptyDir('dist');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@d'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfigNoRecursive,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toEqual([
          { label: 'data/', value: 'data/' },
          { label: 'dist/', value: 'dist/' },
        ]);
      });

      it('should work without config (fallback behavior)', async () => {
        await createEmptyDir('src');
        await createEmptyDir('node_modules');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            undefined,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Without config, should include all files
        expect(result.current.suggestions).toHaveLength(3);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'src/', value: 'src/' },
            { label: 'node_modules/', value: 'node_modules/' },
            { label: 'README.md', value: 'README.md' },
          ]),
        );
      });

      it('should handle git discovery service initialization failure gracefully', async () => {
        // Intentionally don't create a .git directory to cause an initialization failure.
        await createEmptyDir('src');
        await createTestFile('', 'README.md');

        const consoleSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Since we use centralized service, initialization errors are handled at config level
        // This test should verify graceful fallback behavior
        expect(result.current.suggestions.length).toBeGreaterThanOrEqual(0);
        // Should still show completions even if git discovery fails
        expect(result.current.suggestions.length).toBeGreaterThan(0);

        consoleSpy.mockRestore();
      });
    });

    describe('Git-Aware Filtering', () => {
      it('should filter git-ignored entries from @ completions', async () => {
        await createEmptyDir('.git');
        await createTestFile('dist', '.gitignore');
        await createEmptyDir('data');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@d'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        // Wait for async operations to complete
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150)); // Account for debounce
        });

        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([{ label: 'data', value: 'data' }]),
        );
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should filter git-ignored directories from @ completions', async () => {
        await createEmptyDir('.git');
        await createTestFile('node_modules\ndist\n.env', '.gitignore');
        // gitignored entries
        await createEmptyDir('node_modules');
        await createEmptyDir('dist');
        await createTestFile('', '.env');

        // visible
        await createEmptyDir('src');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        // Wait for async operations to complete
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150)); // Account for debounce
        });

        expect(result.current.suggestions).toEqual([
          { label: 'README.md', value: 'README.md' },
          { label: 'src/', value: 'src/' },
        ]);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should handle recursive search with git-aware filtering', async () => {
        await createEmptyDir('.git');
        await createTestFile('node_modules/\ntemp/', '.gitignore');
        await createTestFile('', 'data', 'test.txt');
        await createEmptyDir('dist');
        await createEmptyDir('node_modules');
        await createTestFile('', 'src', 'index.ts');
        await createEmptyDir('src', 'components');
        await createTestFile('', 'temp', 'temp.log');

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@t'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,

            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Should not include anything from node_modules or dist
        const suggestionLabels = result.current.suggestions.map((s) => s.label);
        expect(suggestionLabels).not.toContain('temp/');
        expect(suggestionLabels).not.toContain('node_modules/');
      });
    });
  });

  describe('handleAutocomplete', () => {
    it('should complete a partial command', () => {
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/mem');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          slashCommands,
          mockCommandContext,
          false,

          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'memory',
      ]);

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('/memory ');
    });

    it('should append a sub-command when the parent is complete', () => {
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/memory');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          slashCommands,
          mockCommandContext,
          false,

          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      // Suggestions are populated by useEffect
      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'show',
        'add',
      ]);

      act(() => {
        result.current.handleAutocomplete(1); // index 1 is 'add'
      });

      expect(result.current.textBuffer.text).toBe('/memory add ');
    });

    it('should complete a command with an alternative name', () => {
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/?');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          slashCommands,
          mockCommandContext,
          false,

          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      result.current.suggestions.push({
        label: 'help',
        value: 'help',
        description: 'Show help',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('/help ');
    });

    it('should complete a file path', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@src/fi');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      result.current.suggestions.push({
        label: 'file1.txt',
        value: 'file1.txt',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src/file1.txt ');
    });

    it('should complete a file path when cursor is not at the end of the line', () => {
      const text = '@src/fi le.txt';
      const cursorOffset = 7; // after "i"

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest(text, cursorOffset);
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      result.current.suggestions.push({
        label: 'file1.txt',
        value: 'file1.txt',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src/file1.txt  le.txt');
    });

    it('should complete the correct file path with multiple @-commands', () => {
      const text = '@file1.txt @src/fi';

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest(text);
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      result.current.suggestions.push({
        label: 'file2.txt',
        value: 'file2.txt',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@file1.txt @src/file2.txt ');
    });
  });

  describe('File Path Escaping', () => {
    it('should escape special characters in file names', async () => {
      await createTestFile('', 'my file.txt');
      await createTestFile('', 'file(1).txt');
      await createTestFile('', 'backup[old].txt');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@my'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find(
        (s) => s.label === 'my file.txt',
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.value).toBe('my\\ file.txt');
    });

    it('should escape parentheses in file names', async () => {
      await createTestFile('', 'document(final).docx');
      await createTestFile('', 'script(v2).sh');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@doc'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find(
        (s) => s.label === 'document(final).docx',
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.value).toBe('document\\(final\\).docx');
    });

    it('should escape square brackets in file names', async () => {
      await createTestFile('', 'backup[2024-01-01].zip');
      await createTestFile('', 'config[dev].json');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@backup'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find(
        (s) => s.label === 'backup[2024-01-01].zip',
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.value).toBe('backup\\[2024-01-01\\].zip');
    });

    it('should escape multiple special characters in file names', async () => {
      await createTestFile('', 'my file (backup) [v1.2].txt');
      await createTestFile('', 'data & config {prod}.json');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@my'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find(
        (s) => s.label === 'my file (backup) [v1.2].txt',
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.value).toBe(
        'my\\ file\\ \\(backup\\)\\ \\[v1.2\\].txt',
      );
    });

    it('should preserve path separators while escaping special characters', async () => {
      await createTestFile(
        '',
        'projects',
        'my project (2024)',
        'file with spaces.txt',
      );

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@projects/my'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find((s) =>
        s.label.includes('my project'),
      );
      expect(suggestion).toBeDefined();
      // Should escape spaces and parentheses but preserve forward slashes
      expect(suggestion!.value).toMatch(/my\\ project\\ \\\(2024\\\)/);
      expect(suggestion!.value).toContain('/'); // Should contain forward slash for path separator
    });

    it('should normalize Windows path separators to forward slashes while preserving escaping', async () => {
      // Create test with complex nested structure
      await createTestFile(
        '',
        'deep',
        'nested',
        'special folder',
        'file with (parentheses).txt',
      );

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@deep/nested/special'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestion = result.current.suggestions.find((s) =>
        s.label.includes('special folder'),
      );
      expect(suggestion).toBeDefined();
      // Should use forward slashes for path separators and escape spaces
      expect(suggestion!.value).toContain('special\\ folder/');
      expect(suggestion!.value).not.toContain('\\\\'); // Should not contain double backslashes for path separators
    });

    it('should handle directory names with special characters', async () => {
      await createEmptyDir('my documents (personal)');
      await createEmptyDir('config [production]');
      await createEmptyDir('data & logs');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestions = result.current.suggestions;

      const docSuggestion = suggestions.find(
        (s) => s.label === 'my documents (personal)/',
      );
      expect(docSuggestion).toBeDefined();
      expect(docSuggestion!.value).toBe('my\\ documents\\ \\(personal\\)/');

      const configSuggestion = suggestions.find(
        (s) => s.label === 'config [production]/',
      );
      expect(configSuggestion).toBeDefined();
      expect(configSuggestion!.value).toBe('config\\ \\[production\\]/');

      const dataSuggestion = suggestions.find(
        (s) => s.label === 'data & logs/',
      );
      expect(dataSuggestion).toBeDefined();
      expect(dataSuggestion!.value).toBe('data\\ \\&\\ logs/');
    });

    it('should handle files with various shell metacharacters', async () => {
      await createTestFile('', 'file$var.txt');
      await createTestFile('', 'important!.md');

      const { result } = renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('@'),
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      const suggestions = result.current.suggestions;

      const dollarSuggestion = suggestions.find(
        (s) => s.label === 'file$var.txt',
      );
      expect(dollarSuggestion).toBeDefined();
      expect(dollarSuggestion!.value).toBe('file\\$var.txt');

      const importantSuggestion = suggestions.find(
        (s) => s.label === 'important!.md',
      );
      expect(importantSuggestion).toBeDefined();
      expect(importantSuggestion!.value).toBe('important\\!.md');
    });
  });
});
