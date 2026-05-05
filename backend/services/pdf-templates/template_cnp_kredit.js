const { makeRender } = require('./template_cnp_shared');

const meta = {
    name:         'CNP Kredit Gudang',
    cat_id:       null,
    cat_name:     'CNP',
    description:  'Template CNP — harga kredit gudang, A5 landscape 2-kolom group-aware',
    custom_fields: [
        { key: 'bahan',      label: 'Bahan',      type: 'text' },
        { key: 'berat_asli', label: 'Berat Asli', type: 'text' },
    ],
};

const render = makeRender('kredit_gudang', 'KREDIT');

module.exports = { meta, render };
