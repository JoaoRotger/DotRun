import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export type ProjectOutput = { targetPath: string; isWeb: boolean };

export type LaunchProfile = {
	name: string;
	launchBrowser?: boolean;
	launchUrl?: string;
};

/** Marks the debug configurations DotRun starts, so Stop leaves other sessions alone. */
export const DOTRUN_LAUNCH = '__dotrun';

/** Asks MSBuild for the output assembly, so custom OutputPath and multi-targeting need no parsing of our own. */
export async function resolveProjectOutput(csproj: string, configuration: string): Promise<ProjectOutput> {
	let props = await getProperties(csproj, configuration);
	// Multi-targeted projects have no TargetPath until one framework is picked; Visual Studio takes the first
	const firstFramework = props.TargetFrameworks?.split(';').map(f => f.trim()).find(Boolean);
	if (!props.TargetPath && firstFramework) {
		props = await getProperties(csproj, configuration, firstFramework);
	}
	if (!props.TargetPath) {
		throw new Error(`MSBuild não retornou o TargetPath de ${path.basename(csproj)}`);
	}
	return { targetPath: props.TargetPath, isWeb: props.UsingMicrosoftNETSdkWeb?.toLowerCase() === 'true' };
}

async function getProperties(csproj: string, configuration: string, framework?: string): Promise<Record<string, string>> {
	const args = [
		'msbuild', csproj, '-nologo',
		'-getProperty:TargetPath', '-getProperty:TargetFrameworks', '-getProperty:UsingMicrosoftNETSdkWeb',
		`-p:Configuration=${configuration}`,
		...(framework ? [`-p:TargetFramework=${framework}`] : []),
	];
	const stdout = await new Promise<string>((resolve, reject) => {
		execFile('dotnet', args, { cwd: path.dirname(csproj) }, (err, out, stderr) =>
			err ? reject(new Error((stderr || out || err.message).trim())) : resolve(out));
	});
	return parseGetPropertyOutput(stdout);
}

// -getProperty prints JSON ({"Properties": {...}}) only when asked for more than one property
export function parseGetPropertyOutput(stdout: string): Record<string, string> {
	const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
	return json.Properties ?? {};
}

// Visual Studio starts the first "Project" profile from Properties/launchSettings.json
export function pickLaunchProfile(launchSettingsJson: string): LaunchProfile | undefined {
	const profiles: Record<string, { commandName?: string } & Omit<LaunchProfile, 'name'>> =
		JSON.parse(launchSettingsJson).profiles ?? {};
	const entry = Object.entries(profiles).find(([, p]) => p.commandName === 'Project');
	return entry && { name: entry[0], ...entry[1] };
}

export async function readLaunchProfile(csproj: string): Promise<LaunchProfile | undefined> {
	const file = vscode.Uri.file(path.join(path.dirname(csproj), 'Properties', 'launchSettings.json'));
	try {
		return pickLaunchProfile(new TextDecoder().decode(await vscode.workspace.fs.readFile(file)));
	} catch {
		// No launchSettings.json, or one we can't parse: the debugger still reads it on its own
		return undefined;
	}
}

export function createLaunchConfig(
	csproj: string, output: ProjectOutput, profile: LaunchProfile | undefined, noDebug: boolean,
): vscode.DebugConfiguration {
	const config: vscode.DebugConfiguration = {
		type: 'coreclr',
		request: 'launch',
		name: `DotRun: ${path.basename(csproj, path.extname(csproj))}`,
		program: output.targetPath,
		// The debugger loads env vars, args and URLs from launchSettings.json relative to cwd
		cwd: path.dirname(csproj),
		console: 'integratedTerminal',
		noDebug,
		[DOTRUN_LAUNCH]: true,
	};
	if (profile) {
		config.launchSettingsProfile = profile.name;
		if (profile.launchBrowser) {
			const url = profile.launchUrl ?? '';
			config.serverReadyAction = {
				action: 'openExternally',
				pattern: '\\bNow listening on:\\s+(https?://\\S+)',
				uriFormat: /^https?:\/\//i.test(url) ? url : `%s/${url}`,
			};
		}
	} else if (output.isWeb) {
		config.env = { ASPNETCORE_ENVIRONMENT: 'Development' };
	}
	return config;
}
