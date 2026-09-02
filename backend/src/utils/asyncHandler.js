// Express 4 НЕ ловит автоматически reject/throw из async-обработчиков —
// это не Express 5. Без этой обёртки любая упавшая await pool.query(...)
// превращается в unhandled promise rejection, а в Node 18+/20 это по
// умолчанию РОНЯЕТ весь процесс (а не просто печатает предупреждение).
// Оборачиваем каждый async-роут, чтобы ошибка всегда доходила до
// app.use((err, req, res, next) => ...) в server.js, а не валила бэкенд.
module.exports = function asyncHandler(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
