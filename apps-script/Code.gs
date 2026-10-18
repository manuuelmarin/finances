// Operator facade for the authorized production or test book.
function reportOperator_(callback) {
  let result;
  try {
    result = callback();
  } catch (error) {
    result = apiError_(error);
  }
  console.log(JSON.stringify(result));
  return result;
}
function prepareApplication() {
  return reportOperator_(() => prepareApplication_());
}
function checkApplication() {
  return reportOperator_(() => {
    const config = authorizedConfig_();
    const result = checkClosure_();
    if (result && result.ok) {
      result.dailyPrices = dailyPriceStatus_({
        environment: config.environment,
        bookKey: result.bookKey,
      });
    }
    return result;
  });
}
// Builds a fictional expense in memory; never writes it to the workbook.
function checkSending() {
  return reportOperator_(() => checkSending_());
}
function enableDailyPrices() {
  return reportOperator_(() => {
    const config = authorizedConfig_();
    return config.environment === 'production'
      ? activateDailyPricesProduction_()
      : activateDailyPricesTest_();
  });
}
function updatePrices() {
  return reportOperator_(() => {
    const config = authorizedConfig_();
    return config.environment === 'production'
      ? updatePricesProduction_()
      : updatePricesTest_();
  });
}
function disableDailyPrices() {
  return reportOperator_(() => {
    const config = authorizedConfig_();
    return config.environment === 'production'
      ? deactivateDailyPricesProduction_()
      : deactivateDailyPricesTest_();
  });
}
function doGet(e) {
  return serveApplication_(e);
}
function financialApiJson(requestJson) {
  return financialApiJson_(requestJson);
}
