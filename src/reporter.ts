import * as core from '@actions/core';
import * as github from '@actions/github';
import * as nunjucks from 'nunjucks';

import * as interfaces from './interfaces';
import * as templates from './templates';

nunjucks.configure({
    trimBlocks: true,
    lstripBlocks: true,
});

async function alreadyReported(
    client: github.GitHub,
    advisoryId: string,
): Promise<boolean> {
    const { owner, repo } = github.context.repo;
    const results = await client.search.issuesAndPullRequests({
        q: `${advisoryId} in:title repo:${owner}/${repo}`,
        per_page: 1, // eslint-disable-line @typescript-eslint/camelcase
    });

    if (results.data.total_count > 0) {
        core.info(
            `Seems like ${advisoryId} is mentioned already in the issues/PRs, \
will not report an issue against it`,
        );
        return true;
    } else {
        return false;
    }
}

export async function reportIssues(
    client: github.GitHub,
    vulnerabilities: Array<interfaces.Vulnerability>,
    warnings: Array<interfaces.Warning>,
): Promise<void> {
    const { owner, repo } = github.context.repo;

    for (const vulnerability of vulnerabilities) {
        const reported = await alreadyReported(
            client,
            vulnerability.advisory.id,
        );
        if (reported) {
            continue;
        }

        const body = nunjucks.renderString(templates.VULNERABILITY_ISSUE, {
            vulnerability: vulnerability,
        });
        const issue = await client.issues.create({
            owner: owner,
            repo: repo,
            title: `${vulnerability.advisory.id}: ${vulnerability.advisory.title}`,
            body: body,
        });
        core.info(
            `Created an issue for ${vulnerability.advisory.id}: ${issue.data.html_url}`,
        );
    }

    for (const warning of warnings) {
        let advisory: interfaces.Advisory;
        switch (warning.kind) {
            case 'unmaintained':
            case 'informational':
                advisory = warning.advisory;
                break;
            case 'yanked':
                core.warning(
                    `Crate ${warning.package.name} was yanked, but no issue will be reported about it`,
                );
                continue;
            default:
                core.warning(
                    `Unknown warning kind ${warning.kind} found, please, file a bug`,
                );
                continue;
        }

        const reported = await alreadyReported(client, advisory.id);
        if (reported) {
            continue;
        }

        const body = nunjucks.renderString(templates.WARNING_ISSUE, {
            warning: warning,
            advisory: advisory,
        });
        const issue = await client.issues.create({
            owner: owner,
            repo: repo,
            title: `${advisory.id}: ${advisory.title}`,
            body: body,
        });
        core.info(
            `Created an issue for ${advisory.id}: ${issue.data.html_url}`,
        );
    }
}
