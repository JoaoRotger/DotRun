import * as assert from 'assert';
import * as path from 'path';
import { createLaunchConfig, parseGetPropertyOutput, pickLaunchProfile } from '../launch';

const CSPROJ = path.resolve('/repo/Api/Api.csproj');
const OUTPUT = { targetPath: path.resolve('/repo/Api/bin/Debug/net6.0/Api.dll'), isWeb: true };

suite('Launch', () => {
	test('reads properties from -getProperty JSON', () => {
		const stdout = '{\r\n  "Properties": {\r\n    "TargetPath": "C:\\\\repo\\\\Api.dll",\r\n    "TargetFrameworks": ""\r\n  }\r\n}\r\n';
		assert.deepStrictEqual(parseGetPropertyOutput(stdout), { TargetPath: 'C:\\repo\\Api.dll', TargetFrameworks: '' });
	});

	test('picks the first "Project" profile, skipping IIS Express', () => {
		const settings = JSON.stringify({
			profiles: {
				'IIS Express': { commandName: 'IISExpress', launchBrowser: true },
				Api: { commandName: 'Project', launchBrowser: true, launchUrl: 'swagger' },
				Other: { commandName: 'Project' },
			},
		});
		assert.deepStrictEqual(pickLaunchProfile(settings),
			{ name: 'Api', commandName: 'Project', launchBrowser: true, launchUrl: 'swagger' });
		assert.strictEqual(pickLaunchProfile('{}'), undefined);
	});

	test('launch config uses the profile and opens the browser on launchUrl', () => {
		const config = createLaunchConfig(CSPROJ, OUTPUT, { name: 'Api', launchBrowser: true, launchUrl: 'swagger' }, false);
		assert.strictEqual(config.type, 'coreclr');
		assert.strictEqual(config.program, OUTPUT.targetPath);
		assert.strictEqual(config.cwd, path.dirname(CSPROJ));
		assert.strictEqual(config.launchSettingsProfile, 'Api');
		assert.strictEqual(config.serverReadyAction.uriFormat, '%s/swagger');
		assert.strictEqual(config.env, undefined);
	});

	test('web project without launchSettings runs as Development, without a browser', () => {
		const config = createLaunchConfig(CSPROJ, OUTPUT, undefined, true);
		assert.strictEqual(config.noDebug, true);
		assert.deepStrictEqual(config.env, { ASPNETCORE_ENVIRONMENT: 'Development' });
		assert.strictEqual(config.serverReadyAction, undefined);
	});
});
