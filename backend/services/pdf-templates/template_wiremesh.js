const PdfPrinter = require('pdfmake/src/printer');
const moment     = require('moment-timezone');

moment.locale('id');

const fonts = {
    Helvetica: {
        normal:      'Helvetica',
        bold:        'Helvetica-Bold',
        italics:     'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};

const meta = {
    name:         'Wiremesh',
    cat_id:       null,
    cat_name:     'WIRE MESH',
    description:  'Template Wiremesh — A4 landscape, harga per lembar/roll',
    item_brand:   'HMESH',
    custom_fields: [
        { key: 'tebal_aktual', label: 'Tebal Aktual (mm)', type: 'text' },
        { key: 'grade_label',  label: 'Grade (F/A/B/C)',   type: 'text' },
    ],
};

function render({ items, customValues }) {
    const generatedAt = moment().tz('Asia/Jakarta').format('DD MMMM YYYY HH:mm');

    return new Promise(function (resolve, reject) {
        const dd = {
            pageSize:        'A4',
            pageOrientation: 'landscape',
            pageMargins:     [20, 40, 20, 30],

            header: function () {
                return {
                    text:      'WIREMESH',
                    alignment: 'center',
                    bold:      true,
                    fontSize:  16,
                    margin:    [0, 10, 0, 0],
                };
            },

            content: [
                {
                    text:      'Template layout akan di-build di Phase 2.',
                    alignment: 'center',
                    margin:    [0, 40, 0, 0],
                    fontSize:  13,
                    color:     '#888',
                },
                {
                    text:      'Total item: ' + items.length,
                    alignment: 'center',
                    margin:    [0, 10, 0, 0],
                    fontSize:  12,
                    color:     '#888',
                },
            ],

            footer: function (currentPage, pageCount) {
                return {
                    margin: [10, 5, 10, 0],
                    columns: [
                        { text: 'Page ' + currentPage + '/' + pageCount, alignment: 'left',  fontSize: 10 },
                        { text: 'Jakarta, ' + generatedAt,               alignment: 'right', fontSize: 10 },
                    ],
                };
            },

            defaultStyle: {
                font:     'Helvetica',
                fontSize: 11,
            },
        };

        const printer = new PdfPrinter(fonts);
        const pdfDoc  = printer.createPdfKitDocument(dd);
        const chunks  = [];
        pdfDoc.on('data',  function (chunk) { chunks.push(chunk); });
        pdfDoc.on('end',   function ()       { resolve(Buffer.concat(chunks)); });
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}

module.exports = { meta, render };
