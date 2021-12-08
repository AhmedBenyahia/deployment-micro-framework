import shell from 'shelljs';
import PropertiesReader from 'properties-reader';
import * as os from 'os';
import logger from '../utils/logger.utils';

const { dirname } = require('path');

const appDir = dirname(require.main.filename);
const fs = require('fs');

export default {
  /**
   *  Pull the git repository, build a docker image and run it
   * @returns {Promise<void>}
   */
  buildAndRunContainer: async () => {
    if (!shell.which('git')) {
      shell.echo('Sorry, this script requires git');
      shell.exit(1);
    }
    if (!shell.which('docker')) {
      shell.echo('Sorry, this script requires docker');
      shell.exit(1);
    }
    shell.echo('######## Change dir to repository path ########');
    // eslint-disable-next-line no-unused-expressions
    !shell.cd(process.env.REPO_DIR).code &&
      shell.echo('######## Pulling git repo for updates ########') &&
      !shell.exec('git pull').code &&
      // shell.echo("######## Running mvn clean install ########") &&
      // !shell.exec('mvn clean install -DskipTests').code &&
      shell.echo('######## Building the docker container ########') &&
      !shell.exec('docker build -t ltm-api:webhook .').code &&
      shell.echo('######## Starting the docker container ########') &&
      shell.exec(
        'docker run -p 5005:5005 -p 3306:3306 --name ltm-api ltm-api:webhook',
        { async: true }, // mvn -N io.takari:maven:wrapper
      );
  },

  stopAppServer: () => {
    shell.echo('######## Stop and Delete the old container ########');
    // eslint-disable-next-line no-unused-expressions
    !shell.exec('docker stop ltm-api').code && shell.exec('docker rm ltm-api');
  },

  removeUnusedObject: () => {
    shell.exec('docker image prune -a -f');
    shell.exec('docker container prune -f');
  },

  cloneRepo: async () => {
    logger.debug(`Current Dir:${shell.pwd()}`);
    logger.info('######## Changing Working Dir ########');
    shell.cd(process.env.TMP_DIR);

    logger.debug(`Current Dir:${shell.pwd()}`);
    logger.info('######## Cloning the git repo ########');
    // eslint-disable-next-line no-unused-expressions
    shell.exec(`git clone ${process.env.REPO_URL}`).code;

    logger.info('######## Changing Working Dir ########');
    shell.cd(process.env.REPO_DIR);

    logger.info('######## Checkout deployment branch ########');
    // eslint-disable-next-line no-unused-expressions
    shell.exec(`git checkout ${process.env.REPO_BRANCH}`).code;
  },

  getProjectConfiguration: async () => {
    // Read project application.properties
    const properties = PropertiesReader(
      `${process.env.REPO_DIR}/src/main/resources/application.properties`,
    );
    // Get Db params
    logger.debug(`Datasource: ${properties.get('spring.datasource.url')}`);
    const dbUrl = properties.get('spring.datasource.url');
    const dbType = dbUrl.split(':')[1];
    logger.debug(`DB Type: ${dbType}`);
    let dbName;
    if (dbType === 'sqlserver') {
      dbName = dbUrl
        .split(';')
        .filter((c) => c.indexOf('database') > -1)[0]
        .slice(1);
    } else {
      // eslint-disable-next-line prefer-destructuring
      dbName = dbUrl.split(':')[3].split('/')[1];
    }
    if (!['sqlserver', 'mysql'].includes(dbType)) {
      logger.info('######## DB is not Supported ########');
      return;
    }
    if (!shell.which('docker')) {
      shell.echo('Sorry, this script requires docker');
      shell.exit(1);
    }

    // Check if my.cng file exist
    shell.echo('######## Checking my.cnf file ########');
    if (
      shell.ls('~/my.cnf').stderr &&
      !shell.exec(`grep -Ril -e '[client]' ~/my.cnf `).indexOf(`[client]`) > -1
    ) {
      shell.echo('######## Creating my.cnf file ########');
      await fs.writeFileSync(
        `${os.homedir()}/my.cnf`,
        `[client]
         user=${process.env.RD_USER}
         password=${process.env.RD_PASS}
         host=${process.env.RD_DB}
         `,
        (err) => {
          if (err) logger.info(err);
        },
      );
      // Get app server port
      const serverPort = properties.get('server.port');
      return { dbName, dbUrl, serverPort };
    }

    // Create DB
    shell.echo('######## Connection To Remote SQL DB ########') &&
      shell.echo('######## Creating new DB ########') &&
      shell.exec(
        `mysql --defaults-file=${os.homedir()}/my.cnf -e 'CREATE DATABASE ${dbName};'`,
      ).code &&
      shell.echo('######## Succeeded !! ########') &&
      shell.echo(`CREATED DATABASE ${dbName};`);
  },

  createDockerFile: async ({ dbName, dbUrl, serverPort }) => {
    logger.info('######## Creating Docker file ########');
    logger.debug(`Current Dir:${shell.pwd()}`);
    logger.info('######## Changing Working Dir ########');
    shell.cd(`${process.env.REPO_DIR}src/main`);
    logger.debug(`Current Dir:${shell.pwd()}`);

    // Find main class path
    let mainClassPath = shell.exec(
      'find ./ -type f -name "*Application.java"',
    ).stdout;
    mainClassPath = mainClassPath
      .replace('./java/', '')
      .replace('.java', '')
      .replace('\n', '');
    logger.info(`Main App Class Package: ${mainClassPath}`);

    // In This Step we use a generic docker file for the deployment.
    // And we user the main class path to configure the docker file entry point.
    fs.copyFileSync(
      `${appDir}/../utils/spring-boot-Dockerfile`,
      `${process.env.REPO_DIR}Dockerfile`,
    );
    shell.sed(
      '-i',
      '{{classPath}}',
      mainClassPath,
      `${process.env.REPO_DIR}Dockerfile`,
    );

    // Create new application property file
    fs.copyFileSync(
      `${process.env.REPO_DIR}/src/main/resources/application.properties`,
      `${process.env.REPO_DIR}/src/main/resources/application-prod.properties`,
    );
    // Replace the db url with rds url
    shell.sed(
      '-i',
      '{{localhost}}',
      mainClassPath,
      `${process.env.REPO_DIR}/src/main/resources/application-prod.properties`,
    );
    // Create shell script to build and run application docker container
    shell.echo('######## Creating my.cnf file ########');
    const imageName = process.env.REPO_DIR.split('/')[2];
    const dbPort = dbName === 'mysql' ? '3306' : '1433';
    await fs.writeFileSync(
      `${process.env.REPO_DIR}build-run.sh`,
      ` docker build -t ${imageName}:autoBuild . &&
             docker run -p ${dbPort}:${dbPort} -p ${serverPort}:${serverPort} --name ${imageName} ${imageName}:autoBuild
         `,
      (err) => {
        if (err) logger.info(err);
      },
    );
  },
};
