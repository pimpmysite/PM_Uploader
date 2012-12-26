<?php
if ( ! class_exists( 'PM' ) ) {
class PM {

	public function get_theme_directory( $file, $childonly=false ) {
		$located = '';
		
		$file = trim( $file, '/' );
	
		if ( file_exists( STYLESHEETPATH . '/' . $file ) )
			$located = get_stylesheet_directory() . '/' . $file;
		else if ( ! $childonly && file_exists( TEMPLATEPATH . '/' . $file ) )
			$located = get_template_directory() . '/' . $file;
		
		return $located;
	}
	
	public function get_theme_uri( $file, $childonly=false ) {
		$located = '';
		
		$file = trim( $file, '/' );
	
		if ( file_exists( STYLESHEETPATH . '/' . $file ) )
			$located = get_stylesheet_directory_uri() . '/' . $file;
		else if ( ! $childonly && file_exists( TEMPLATEPATH . '/' . $file ) )
			$located = get_template_directory_uri() . '/' . $file;
		
		return $located;
	}

	public function realuri( $path ) {
		$base = '';
		$file = str_replace( "\\", '/', __FILE__ );

		$dirs = array(
			get_stylesheet_directory()	=> get_stylesheet_directory_uri()
		  , get_template_directory()	=> get_template_directory_uri()
		);
		
		foreach ( $dirs as $dir => $uri ) {
			$dir_ = str_replace( "\\", '/', $dir );

			if( 0 === strpos( $file, $dir_ ) ) {
				$folder = str_replace( $dir_, '', dirname( $file ) );
				$base    = $uri . $folder;
				break;			
			}
		}
		
		if ( empty( $base ) ) {
			$base = trim( plugin_dir_url( $file ), '/' );	
		}
		return trailingslashit( $base ) . trim( $path, '/' );
	}	

	public function get_post_by( $field, $value, $post_type='post' ) {
		global $wpdb;

		switch( $field ) {
			case 'id':
				$field = 'p.ID';
				break;
			case 'slug':
			case 'name':
				$field = 'p.post_name';
				break;
			case 'title':
				$field = 'p.post_title';
				break;
			default:
				return false;
		}
		
		$key   = $post_type . $field . $value;
		$_post = wp_cache_get( $key, 'posts' );

		if ( ! $_post ) {
			$_post = $wpdb->get_row( $wpdb->prepare( 
				"SELECT * FROM $wpdb->posts AS p WHERE p.post_type=%s AND $field=%s AND p.post_status=%s"
			  . " ORDER BY p.post_date DESC LIMIT 1"
			  , $post_type
			  , $value
			  , 'publish'
			) );

			if ( ! $_post )
				return false;

			$_post = sanitize_post( $_post, 'raw' );
			wp_cache_add( $key, $_post, 'posts' );
		} elseif ( empty( $_post->filter ) ) {
			$_post = sanitize_post( $_post, 'raw' );
		}

		return new WP_Post( $_post );
	}

}
}