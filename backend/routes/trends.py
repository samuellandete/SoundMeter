from flask import Blueprint, jsonify, request
from services.trends_service import get_period_aggregations

trends_bp = Blueprint('trends', __name__)


@trends_bp.route('/api/trends', methods=['GET'])
def get_trends():
    """
    Get aggregated trends data.

    Query parameters:
    - granularity: 'day', 'week', or 'month' (required)
    - start_date: Start date YYYY-MM-DD (required)
    - end_date: End date YYYY-MM-DD (required)
    - slots: Comma-separated slot IDs (optional)
    - zones: Comma-separated zone IDs (optional)
    """
    granularity = request.args.get('granularity')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    slots_str = request.args.get('slots')
    zones_str = request.args.get('zones')

    # Validate required parameters
    if not granularity:
        return jsonify({'error': 'granularity parameter is required'}), 400
    if granularity not in ('day', 'week', 'month'):
        return jsonify({'error': 'granularity must be day, week, or month'}), 400
    if not start_date:
        return jsonify({'error': 'start_date parameter is required'}), 400
    if not end_date:
        return jsonify({'error': 'end_date parameter is required'}), 400

    # Parse optional filters
    slot_ids = None
    if slots_str:
        try:
            slot_ids = [int(s.strip()) for s in slots_str.split(',')]
        except ValueError:
            return jsonify({'error': 'Invalid slots parameter'}), 400

    zone_ids = None
    if zones_str:
        try:
            zone_ids = [int(z.strip()) for z in zones_str.split(',')]
        except ValueError:
            return jsonify({'error': 'Invalid zones parameter'}), 400

    try:
        result = get_period_aggregations(
            granularity=granularity,
            start_date=start_date,
            end_date=end_date,
            slot_ids=slot_ids,
            zone_ids=zone_ids
        )
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
