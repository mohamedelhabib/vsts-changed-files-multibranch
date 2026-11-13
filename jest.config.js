module.exports = {
    testEnvironment: "node",
    testMatch: ["**/changed-files/tests/*.spec.js"],
    globalSetup: "./changed-files/tests/_global-setup.js",
    testTimeout: 30000,
};
